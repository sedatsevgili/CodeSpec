# Calculator

```codespec
MODULE Calculator {
  OUTPUT {
    state: Float
  }

  ACTION add(number: Float) -> Float {
    SET state = number
    RETURN state
  }

  ACTION subtract(number: Float) -> Float {
    SET state = number
    RETURN state
  }

  ACTION muliply(number: Float) -> Float {
    SET state = number
    RETURN state
  }

  ACTION divide(number: Float) -> Float {
    WHEN number === 0.0 {
      FAIL RuntimeException "Can not divide by 0"
    }
    SET state = number
    RETURN state
  }
}
```
