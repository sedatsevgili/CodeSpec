<?php

final class Calculator {
    private float $state = 0.0;

    public function add(float $number): float
    {
        $this->state += $number;

        return $this->state;
    }

    public function subtract(float $number): float
    {
        $this->state -= $number;

        return $this->state;
    }

    public function muliply(float $number): float
    {
        $this->state *= $number;

        return $this->state;
    }

    public function divide(float $number): float
    {
        if ($number === 0.0) {
            throw new \RuntimeException('Can not divide by 0');
        }

        $this->state /= $number;

        return $this->state;
    }
}