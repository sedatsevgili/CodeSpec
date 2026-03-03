# Payment Processor

This module handles payment processing for an e-commerce platform. It demonstrates LIMIT for rate limiting, RETRY for resilient external calls, multiple ACTIONs for different payment operations, MATCH with several arms for status handling, nested WHEN for conditional logic, and EMIT for domain events throughout the payment lifecycle.

```codespec
MODULE PaymentProcessor {
  INPUT {
    amount: Float [min:0.01, max:999999.99]
    currency: String [enum:("USD","EUR","GBP","JPY","CAD")]
    customerId: UUID
    paymentMethod: String [enum:("credit_card","debit_card","bank_transfer","wallet")]
    idempotencyKey: UUID
    metadata: Map<String, String>?
  }

  OUTPUT {
    transactionId: UUID
    status: String
    receiptUrl: String?
    processedAt: DateTime
  }

  STATE {
    READS customers: List<Customer>
    READS paymentMethods: List<PaymentMethod>
    READS transactions: List<Transaction>
    WRITES transactions: List<Transaction>
    WRITES ledger: List<LedgerEntry>
    WRITES notifications: List<Notification>
  }

  -- Process a new payment with fraud detection and retry logic
  ACTION processPayment(customerId: UUID, amount: Float, currency: String, paymentMethod: String, idempotencyKey: UUID, metadata: Map<String, String>?) -> Transaction {
    -- Rate limit payment attempts per customer
    LIMIT 10 PER "minute" {
      ON_EXCEED {
        EMIT RateLimitExceeded { customerId }
        FAIL RateLimited "Too many payment attempts, please try again later"
      }
    }

    -- Check for duplicate submissions using idempotency key
    SET existingTx = CALL findByIdempotencyKey(idempotencyKey)
    WHEN existingTx != null {
      RETURN existingTx
    }

    -- Verify the customer exists and is in good standing
    SET customer = CALL findCustomer(customerId)
    WHEN customer == null {
      FAIL CustomerNotFound "Customer account not found"
    }

    MATCH CALL getCustomerStatus(customerId) {
      "suspended" -> FAIL AccountSuspended "This account has been suspended"
      "closed" -> FAIL AccountClosed "This account has been closed"
      "active" -> {
        -- Continue processing
        SET verified = true
      }
      _ -> FAIL InvalidAccountStatus "Unrecognized account status"
    }

    -- Validate the payment method belongs to this customer
    SET method = CALL validatePaymentMethod(customerId, paymentMethod)
    WHEN method == null {
      FAIL InvalidPaymentMethod "Payment method not found or not authorized"
    }

    -- Run fraud detection checks
    SET fraudScore = CALL checkFraudRisk(customerId, amount, currency, paymentMethod)
    WHEN fraudScore > 0.85 {
      EMIT FraudSuspected { customerId, amount, fraudScore }
      CALL flagForManualReview(customerId, amount, fraudScore)
      FAIL FraudDetected "Transaction flagged for suspicious activity"
    }
    WHEN fraudScore > 0.5 {
      EMIT ElevatedFraudRisk { customerId, amount, fraudScore }
      CALL requestAdditionalVerification(customerId)
    }

    -- Create a pending transaction record
    SET transaction = CALL createTransaction(customerId, amount, currency, paymentMethod, idempotencyKey, metadata)
    EMIT PaymentInitiated { transaction }

    -- Charge the payment gateway with retry logic
    RETRY CALL chargePaymentGateway(transaction.id, amount, currency, method) 3 TIMES DELAY "1s" {
      ON_EXHAUST {
        CALL markTransactionFailed(transaction.id, "gateway_timeout")
        EMIT PaymentFailed { transaction, reason: "gateway_timeout" }
        FAIL GatewayTimeout "Payment gateway did not respond after retries"
      }
    }

    -- Process the gateway response
    SET gatewayResult = CALL getGatewayResponse(transaction.id)
    MATCH gatewayResult.status {
      "approved" -> {
        CALL markTransactionCompleted(transaction.id, gatewayResult.referenceId)
        CALL recordLedgerEntry(transaction.id, amount, currency, "debit")
        SET receiptUrl = CALL generateReceipt(transaction.id)
        EMIT PaymentCompleted { transaction, receiptUrl }
      }
      "declined" -> {
        CALL markTransactionFailed(transaction.id, "declined")
        EMIT PaymentDeclined { transaction, reason: gatewayResult.declineReason }
        FAIL PaymentDeclined "Payment was declined by the issuing bank"
      }
      "pending_review" -> {
        CALL markTransactionPending(transaction.id)
        EMIT PaymentPendingReview { transaction }
        CALL notifyComplianceTeam(transaction.id)
      }
      _ -> {
        CALL markTransactionFailed(transaction.id, "unknown_status")
        EMIT PaymentFailed { transaction, reason: "unknown_gateway_status" }
        FAIL GatewayError "Unexpected response from payment gateway"
      }
    }

    -- Send confirmation to customer
    RETRY CALL sendPaymentConfirmation(customer.email, transaction.id) 2 TIMES DELAY "3s" {
      ON_EXHAUST {
        EMIT ConfirmationEmailFailed { customerId, transaction }
        CALL scheduleRetryNotification(customerId, transaction.id)
      }
    }

    RETURN transaction
  }

  -- Issue a refund for a completed transaction
  ACTION refundPayment(transactionId: UUID, reason: String, amount: Float?) -> Transaction {
    -- Rate limit refund attempts
    LIMIT 5 PER "hour" {
      ON_EXCEED {
        FAIL RateLimited "Too many refund requests, please contact support"
      }
    }

    SET transaction = CALL findTransaction(transactionId)
    WHEN transaction == null {
      FAIL TransactionNotFound "Transaction not found"
    }

    -- Verify the transaction is eligible for refund
    MATCH transaction.status {
      "completed" -> {
        -- Full or partial refund
        WHEN amount == null {
          SET refundAmount = transaction.amount
        } OTHERWISE {
          SET refundAmount = amount
          WHEN refundAmount > transaction.amount {
            FAIL InvalidRefundAmount "Refund amount exceeds original transaction"
          }
        }
      }
      "pending" -> FAIL RefundNotAllowed "Cannot refund a pending transaction"
      "refunded" -> FAIL AlreadyRefunded "This transaction has already been refunded"
      "failed" -> FAIL RefundNotAllowed "Cannot refund a failed transaction"
      _ -> FAIL RefundNotAllowed "Transaction is not in a refundable state"
    }

    -- Process the refund through the gateway
    RETRY CALL refundThroughGateway(transaction.gatewayRef, refundAmount, transaction.currency) 3 TIMES DELAY "2s" {
      ON_EXHAUST {
        EMIT RefundFailed { transactionId, reason: "gateway_timeout" }
        CALL escalateToSupport(transactionId, "refund_gateway_timeout")
        FAIL GatewayTimeout "Refund gateway did not respond"
      }
    }

    -- Update records
    CALL markTransactionRefunded(transactionId, refundAmount)
    CALL recordLedgerEntry(transactionId, refundAmount, transaction.currency, "credit")
    EMIT RefundCompleted { transactionId, refundAmount, reason }

    -- Notify the customer
    SET customer = CALL findCustomer(transaction.customerId)
    RETRY CALL sendRefundConfirmation(customer.email, transactionId, refundAmount) 2 TIMES DELAY "3s" {
      ON_EXHAUST {
        EMIT RefundNotificationFailed { transactionId, customer.email }
      }
    }

    RETURN transaction
  }

  -- Retrieve the current status of a transaction
  ACTION getTransactionStatus(transactionId: UUID) -> Transaction {
    SET transaction = CALL findTransaction(transactionId)
    WHEN transaction == null {
      FAIL TransactionNotFound "Transaction not found"
    }

    -- Sync status with gateway for pending transactions
    WHEN transaction.status == "pending_review" {
      RETRY CALL syncGatewayStatus(transactionId) 2 TIMES DELAY "500ms" {
        ON_EXHAUST {
          -- Return cached status if gateway is unavailable
          EMIT GatewaySyncFailed { transactionId }
        }
      }
      SET transaction = CALL findTransaction(transactionId)
    }

    RETURN transaction
  }

  INVARIANTS {
    ALWAYS "Idempotency keys prevent duplicate charges for the same payment intent"
    ALWAYS "All monetary amounts are processed with two decimal places of precision"
    ALWAYS "Every transaction state change is recorded in the immutable ledger"
    ALWAYS "Fraud detection runs before any charge is submitted to the gateway"
    ALWAYS "Rate limiting is enforced before any business logic executes"
    NEVER "A refund amount exceeds the original transaction amount"
    NEVER "A suspended or closed account is charged"
    NEVER "PCI-sensitive card data is stored in application logs or the database"
    NEVER "A transaction is charged twice for the same idempotency key"
  }

  ERRORS {
    CustomerNotFound 404 "Customer account not found"
    TransactionNotFound 404 "Transaction not found"
    InvalidPaymentMethod 400 "Payment method not found or not authorized"
    InvalidRefundAmount 400 "Refund amount exceeds original transaction"
    PaymentDeclined 402 "Payment was declined by the issuing bank"
    FraudDetected 403 "Transaction flagged for suspicious activity"
    AccountSuspended 403 "This account has been suspended"
    AccountClosed 403 "This account has been closed"
    InvalidAccountStatus 400 "Unrecognized account status"
    RefundNotAllowed 409 "Transaction is not in a refundable state"
    AlreadyRefunded 409 "This transaction has already been refunded"
    RateLimited 429 "Too many requests, please try again later"
    GatewayTimeout 504 "Payment gateway did not respond"
    GatewayError 502 "Unexpected response from payment gateway"
  }

  DEPENDS {
    PaymentGateway "Stripe API for charge processing and refunds"
    FraudService "ML-based fraud detection and risk scoring"
    Database "PostgreSQL for transaction and customer records"
    LedgerService "Append-only financial ledger for reconciliation"
    NotificationService "Email and SMS notifications to customers"
    ComplianceQueue "Message queue for compliance team review"
  }
}
```
