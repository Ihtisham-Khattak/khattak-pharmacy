/**
 * Unit tests for receipt builder (no DOM required).
 */

const { buildReceipt } = require("../assets/js/receipt");

describe("buildReceipt", () => {
  const baseSettings = {
    store: "Test Pharmacy",
    address_one: "1 Main St",
    address_two: "",
    contact: "555-0100",
    tax: "VAT-1",
    symbol: "$",
    percentage: 10,
    charge_tax: 1,
    footer: "Come again",
  };

  test("renders store branding, items, discount, tax, and totals", () => {
    const html = buildReceipt({
      settings: baseSettings,
      logoPath: "",
      orderNumber: "ORD-1",
      date: "24 Jul 2026 12:00",
      cashier: "Alex",
      refNumber: "HOLD-1",
      customerName: "Sam",
      items: [{ product_name: "Aspirin", quantity: 2, price: 5 }],
      subtotal: 10,
      discount: 1,
      taxAmount: 0.9,
      total: 9.9,
      paid: 10,
      change: 0.1,
      paymentMethod: "Cash",
    });

    expect(html).toContain("Test Pharmacy");
    expect(html).toContain("Aspirin");
    expect(html).toContain("Discount");
    expect(html).toContain("TOTAL");
    expect(html).toContain("Sam");
    expect(html).toContain("ps-receipt");
  });

  test("shows HOLD banner when statusLabel provided", () => {
    const html = buildReceipt({
      settings: baseSettings,
      orderNumber: "ORD-2",
      date: "24 Jul 2026 12:00",
      items: [{ product_name: "Bandage", quantity: 1, price: 3 }],
      subtotal: 3,
      discount: 0,
      taxAmount: 0,
      total: 3,
      paid: "",
      change: 0,
      statusLabel: "HOLD ORDER",
    });

    expect(html).toContain("HOLD ORDER");
  });
});
