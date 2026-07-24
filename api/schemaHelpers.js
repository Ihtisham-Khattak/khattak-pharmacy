function writeTransactionItems(db, transactionId, items) {
  db.prepare("DELETE FROM transaction_items WHERE transaction_id = ?").run(
    transactionId,
  );

  if (!items || !Array.isArray(items) || items.length === 0) {
    return;
  }

  const insertStmt = db.prepare(`
    INSERT INTO transaction_items (transaction_id, product_id, product_name, quantity, unit_price, line_total)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const item of items) {
    const productId = parseInt(item.id, 10);
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.price) || 0;
    if (isNaN(productId) || qty <= 0) continue;
    const productName =
      item.product_name != null ? String(item.product_name) : "";
    insertStmt.run(
      transactionId,
      productId,
      productName,
      qty,
      price,
      qty * price,
    );
  }
}

/**
 * Prefer normalized transaction_items rows; fall back to legacy JSON blob.
 * Returns cart-shaped objects: { id, product_name, quantity, price }.
 */
function readTransactionItems(db, transactionRow) {
  if (!transactionRow || !transactionRow.id) {
    return [];
  }

  try {
    const rows = db
      .prepare(
        `
        SELECT product_id, product_name, quantity, unit_price
        FROM transaction_items
        WHERE transaction_id = ?
        ORDER BY id ASC
      `,
      )
      .all(transactionRow.id);

    if (rows && rows.length > 0) {
      return rows.map((row) => ({
        id: row.product_id,
        product_name: row.product_name,
        quantity: row.quantity,
        price: row.unit_price,
      }));
    }
  } catch (err) {
    // Table may be mid-migration; fall through to JSON.
  }

  if (transactionRow.items == null || transactionRow.items === "") {
    return [];
  }
  if (Array.isArray(transactionRow.items)) {
    return transactionRow.items;
  }
  try {
    const parsed = JSON.parse(transactionRow.items);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function recordStockMovement(
  db,
  { productId, qtyDelta, reason, refType, refId, userId },
) {
  db.prepare(`
    INSERT INTO stock_movements (product_id, qty_delta, reason, ref_type, ref_id, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    productId,
    qtyDelta,
    reason,
    refType || null,
    refId || null,
    userId != null ? userId : null,
  );
}

function recordStockMovementsForItems(
  db,
  items,
  { reason, refType, refId, userId, sign },
) {
  if (!items || !Array.isArray(items)) {
    return;
  }

  for (const item of items) {
    const productId = parseInt(item.id, 10);
    const qty = parseFloat(item.quantity) || 0;
    if (isNaN(productId) || qty <= 0) continue;
    recordStockMovement(db, {
      productId,
      qtyDelta: Math.round(sign * qty),
      reason,
      refType,
      refId,
      userId,
    });
  }
}

module.exports = {
  writeTransactionItems,
  readTransactionItems,
  recordStockMovement,
  recordStockMovementsForItems,
};
