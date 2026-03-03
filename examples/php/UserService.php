<?php

declare(strict_types=1);

class UserService
{
    private UserRepository $repository;
    private EventDispatcher $dispatcher;

    public function __construct(UserRepository $repository, EventDispatcher $dispatcher)
    {
        $this->repository = $repository;
        $this->dispatcher = $dispatcher;
    }

    /**
     * Register a new user account.
     */
    public function register(string $name, string $email, int $age): array
    {
        if ($name === '') {
            throw new InvalidArgumentException('Name is required');
        }

        if ($age < 18) {
            throw new InvalidArgumentException('Must be at least 18 years old');
        }

        if ($age > 120) {
            throw new InvalidArgumentException('Invalid age');
        }

        $user = $this->repository->create($name, $email, $age);

        $this->dispatcher->dispatch('user.registered', $user);

        return $user;
    }

    /**
     * Find a user by their ID.
     */
    public function findById(string $id): array
    {
        if ($id === '') {
            throw new InvalidArgumentException('User ID is required');
        }

        $user = $this->repository->findById($id);

        if ($user === null) {
            throw new RuntimeException('User not found');
        }

        return $user;
    }

    /**
     * Deactivate a user account.
     */
    public function deactivate(string $id): void
    {
        $user = $this->findById($id);
        $this->repository->update($id, false);
        $this->dispatcher->dispatch('user.deactivated', $id);
    }

    /**
     * Calculate a discount based on membership tier.
     */
    public function calculateDiscount(float $price, string $tier): float
    {
        switch ($tier) {
            case 'gold':
                return $price * 0.20;
            case 'silver':
                return $price * 0.10;
            case 'bronze':
                return $price * 0.05;
            default:
                return 0.0;
        }
    }
}
