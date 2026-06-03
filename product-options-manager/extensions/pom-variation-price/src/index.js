const EMPTY_RESULT = { operations: [] };

export function cartTransformRun(input) {
  const operations = input.cart.lines.flatMap((line) => {
    if (line.priceSource?.value !== "exact_variation") return [];

    const amount = Number(line.unitPrice?.value);

    if (!Number.isFinite(amount) || amount <= 0) return [];

    return [
      {
        lineUpdate: {
          cartLineId: line.id,
          price: {
            adjustment: {
              fixedPricePerUnit: {
                amount,
              },
            },
          },
        },
      },
    ];
  });

  return operations.length ? { operations } : EMPTY_RESULT;
}
