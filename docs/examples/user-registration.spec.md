# User Registration

This module handles user registration, including input validation, duplicate checking, password hashing, user creation, and email verification. It demonstrates the core CodeSpec constructs: INPUT, OUTPUT, STATE, ACTION with conditional logic, pattern matching, error handling, event emission, retry logic, INVARIANTS, ERRORS, and DEPENDS.

```codespec
MODULE UserRegistration {
  -- Input validation rules for new user registration
  INPUT {
    email: Email [format:email]
    password: String [min:8, max:128, pattern:"^(?=.*[A-Z])(?=.*[0-9])"]
    name: String [min:1, max:100]
    role: String [enum:("admin","user","guest")]
    referralCode: String?
  }

  OUTPUT {
    user: User
    token: String
    welcomeEmailSent: Bool
  }

  STATE {
    READS users: List<User>
    READS config: Config
    WRITES users: List<User>
    WRITES sessions: List<Session>
    WRITES auditLog: List<AuditEntry>
  }

  -- Main registration flow
  ACTION register(email: Email, password: String, name: String, role: String, referralCode: String?) -> User {
    -- Step 1: Check for duplicate email
    WHEN CALL userExists(email) {
      FAIL EmailAlreadyExists "A user with this email already exists"
    }

    -- Step 2: Validate the role
    MATCH role {
      "admin" -> FAIL AdminRegistrationForbidden "Admin accounts cannot be self-registered"
      "user" -> SET permissions = CALL getDefaultUserPermissions()
      "guest" -> SET permissions = CALL getGuestPermissions()
      _ -> FAIL InvalidRole "Unrecognized role"
    }

    -- Step 3: Hash the password and create the user
    SET hashedPassword = CALL hashPassword(password)
    SET user = CALL createUser(email, hashedPassword, name, role, permissions)

    -- Step 4: Apply referral bonus if a code was provided
    WHEN referralCode != null {
      SET referrer = CALL lookupReferrer(referralCode)
      WHEN referrer != null {
        CALL applyReferralBonus(referrer, user)
        EMIT ReferralApplied { referrer, user }
      }
    }

    -- Step 5: Create a session and send verification email
    SET session = CALL createSession(user)
    SET token = session.token

    RETRY CALL sendVerificationEmail(user.email, token) 3 TIMES DELAY "2s" {
      ON_EXHAUST {
        EMIT VerificationEmailFailed { user.email }
        CALL logWarning("Verification email failed", user.email)
      }
    }

    -- Step 6: Log and emit event
    CALL writeAuditLog("USER_REGISTERED", user.id)
    EMIT UserRegistered { user, role }

    RETURN user
  }

  -- Delete a user by ID with role-based access control
  ACTION deleteUser(requesterId: UUID, userId: UUID) -> Void {
    -- Verify the target user exists
    RETRY CALL findUser(userId) 3 TIMES DELAY "1s" {
      ON_EXHAUST {
        FAIL UserNotFound "User not found after retries"
      }
    }

    -- Check permissions based on role
    MATCH CALL getUserRole(userId) {
      "admin" -> FAIL CannotDeleteAdmin "Cannot delete admin users"
      "user" -> {
        WHEN requesterId != userId {
          WHEN CALL isAdmin(requesterId) {
            CALL removeUser(userId)
            EMIT UserDeleted { userId, deletedBy: requesterId }
          } OTHERWISE {
            FAIL Unauthorized "Only admins can delete other users"
          }
        } OTHERWISE {
          CALL removeUser(userId)
          EMIT UserDeleted { userId, deletedBy: requesterId }
        }
      }
      "guest" -> {
        CALL removeUser(userId)
        EMIT UserDeleted { userId, deletedBy: requesterId }
      }
    }

    CALL writeAuditLog("USER_DELETED", userId)
    RETURN void
  }

  -- Look up a user by email address
  ACTION findByEmail(email: Email) -> User {
    SET user = CALL queryUserByEmail(email)
    WHEN user == null {
      FAIL UserNotFound "No user found with this email address"
    }
    RETURN user
  }

  INVARIANTS {
    ALWAYS "Passwords are stored as bcrypt hashes, never plaintext"
    ALWAYS "All state mutations are wrapped in a database transaction"
    ALWAYS "Audit log entries are written for every registration and deletion"
    NEVER "User email addresses are shared with third parties without explicit consent"
    NEVER "Admin accounts can be created through the public registration endpoint"
  }

  ERRORS {
    EmailAlreadyExists 409 "A user with this email already exists"
    UserNotFound 404 "The requested user was not found"
    CannotDeleteAdmin 403 "Cannot delete admin users"
    AdminRegistrationForbidden 403 "Admin accounts cannot be self-registered"
    InvalidRole 400 "The specified role is not recognized"
    Unauthorized 401 "Insufficient permissions for this operation"
    VerificationEmailFailed 502 "Failed to send verification email"
  }

  DEPENDS {
    HashService "Bcrypt password hashing and verification"
    EmailService "Sending verification and notification emails"
    Database "PostgreSQL user persistence layer"
    AuditLogger "Immutable audit trail for compliance"
    SessionStore "Redis-backed session management"
  }
}
```
