export type VendorTaxMode = 'unregistered' | 'composition' | 'regular';

export interface TaxCalculationInput {
  subtotalPaise: number;
  taxMode: VendorTaxMode;
  gstRateBps: number;
}

export interface TaxCalculationResult {
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalTaxPaise: number;
  totalPaise: number;
  taxMode: VendorTaxMode;
  gstRateBps: number;
}

/**
 * Pure integer-paise GST calculator with zero floating-point arithmetic.
 * - 'unregistered' or 'composition': 0 tax (cgstPaise=0, sgstPaise=0)
 * - 'regular': half-up integer rounding on totalTaxPaise, split into cgst + sgst
 *   with sgst taking any odd remainder paise so subtotal + cgst + sgst === total ALWAYS.
 */
export function calculateOrderTax(input: TaxCalculationInput): TaxCalculationResult {
  const { subtotalPaise, taxMode, gstRateBps } = input;

  if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise < 0) {
    throw new Error('subtotalPaise must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(gstRateBps) || gstRateBps < 0 || gstRateBps > 10000) {
    throw new Error('gstRateBps must be a safe integer between 0 and 10000');
  }

  if (taxMode !== 'regular' || gstRateBps === 0) {
    return {
      subtotalPaise,
      cgstPaise: 0,
      sgstPaise: 0,
      totalTaxPaise: 0,
      totalPaise: subtotalPaise,
      taxMode,
      gstRateBps: 0,
    };
  }

  // Half-up integer rounding: floor((subtotal * bps + 5000) / 10000) using BigInt
  const totalTaxBig = (BigInt(subtotalPaise) * BigInt(gstRateBps) + 5000n) / 10000n;
  const totalTaxPaise = Number(totalTaxBig);
  if (!Number.isSafeInteger(totalTaxPaise)) {
    throw new Error('Calculated tax exceeds safe integer paise range');
  }

  const cgstPaise = Math.floor(totalTaxPaise / 2);
  const sgstPaise = totalTaxPaise - cgstPaise;
  const totalPaise = subtotalPaise + cgstPaise + sgstPaise;

  return {
    subtotalPaise,
    cgstPaise,
    sgstPaise,
    totalTaxPaise,
    totalPaise,
    taxMode,
    gstRateBps,
  };
}
