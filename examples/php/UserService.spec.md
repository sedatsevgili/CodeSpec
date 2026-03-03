# UserService

```codespec
MODULE UserService {
  STATE {
    READS repository: repository
    WRITES repository: repository
  }

  OUTPUT {
    repository: UserRepository
    dispatcher: EventDispatcher
  }

  ACTION register(name: String, email: String, age: Int) -> List<String> {
    WHEN name === "" {
      FAIL InvalidArgumentException "Name is required"
    }
    WHEN age < 18 {
      FAIL InvalidArgumentException "Must be at least 18 years old"
    }
    WHEN age > 120 {
      FAIL InvalidArgumentException "Invalid age"
    }
    CALL repository.create(name, email, age)
    CALL dispatcher.dispatch("user.registered", user)
    RETURN user
  }

  ACTION findById(id: String) -> List<String> {
    WHEN id === "" {
      FAIL InvalidArgumentException "User ID is required"
    }
    CALL repository.findById(id)
    WHEN user === null {
      FAIL RuntimeException "User not found"
    }
    RETURN user
  }

  ACTION deactivate(id: String) -> Void {
    CALL this.findById(id)
    CALL repository.update(id, false)
    CALL dispatcher.dispatch("user.deactivated", id)
  }

  ACTION calculateDiscount(price: Float, tier: String) -> Float {
    MATCH tier {
      gold -> RETURN price * 0.20
      silver -> RETURN price * 0.10
      bronze -> RETURN price * 0.05
      _ -> RETURN 0.0
    }
  }
}
```
