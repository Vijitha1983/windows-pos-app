// ERPNext Promotional Scheme matching logic.
// Scans both price_discount_slabs and product_discount_slabs regardless of
// the price_or_product_discount field so it works across all ERPNext versions.
// Product Discount with empty free_item + same_item=1 gives the purchased item free.

export function findApplicablePromo(schemes, itemCode, itemGroup, qty) {
  if (!schemes?.length || qty <= 0) return null

  for (const scheme of schemes) {
    const matches = schemeMatchesItem(scheme, itemCode, itemGroup)
    console.log('[PROMO] scheme:', scheme.name, '| itemMatch:', matches,
      '| priceSlabs:', (scheme.price_discount_slabs || []).length,
      '| productSlabs:', (scheme.product_discount_slabs || []).length)

    if (!matches) continue

    // ── Price discount slabs ──────────────────────────────────────────────
    for (const slab of (scheme.price_discount_slabs || [])) {
      const inRange = qtyInSlab(qty, slab)
      console.log('[PROMO]  price slab min:', slab.min_qty, 'max:', slab.max_qty,
        'rate:', slab.rate, '| qty:', qty, '| inRange:', inRange)
      if (inRange && parseFloat(slab.rate) > 0) {
        return {
          type: 'price',
          rate: parseFloat(slab.rate),
          discountType: slab.discount_type || 'Rate',
          schemeName: scheme.name,
        }
      }
    }

    // ── Product discount slabs ────────────────────────────────────────────
    for (const slab of (scheme.product_discount_slabs || [])) {
      const inRange = qtyInSlab(qty, slab)
      console.log('[PROMO]  product slab min:', slab.min_qty, 'max:', slab.max_qty,
        'freeItem:', slab.free_item, 'freeQty:', slab.free_qty,
        'sameItem:', slab.same_item, '| qty:', qty, '| inRange:', inRange)
      if (inRange) {
        const freeQty = parseFloat(slab.free_qty) || 1
        // same_item=1 or no free_item set → give purchased item for free
        const sameItem = !!(slab.same_item || !slab.free_item)
        return {
          type: 'product',
          freeItem: slab.free_item || null,
          freeItemName: slab.free_item_name || slab.free_item || null,
          freeQty,
          sameItem,
          schemeName: scheme.name,
        }
      }
    }
  }

  return null
}

// Applies promos to the items array after a single item's qty changed.
// Never mutates — always returns a new array.
export function applyPromos(items, changedItemId, schemes) {
  if (!schemes?.length) return items

  const changedItem = items.find((i) => i.id === changedItemId)
  if (!changedItem || changedItem.isFreePromo) return items

  const promo = findApplicablePromo(schemes, changedItem.item_code, changedItem.item_group, changedItem.qty)
  console.log('[PROMO] result for', changedItem.item_code, 'qty', changedItem.qty, '→', promo)

  // Update the changed item's unit price
  let newItems = items.map((item) => {
    if (item.id !== changedItemId) return item

    if (promo?.type === 'price') {
      return {
        ...item,
        unitPrice: promo.rate,
        total: item.qty * promo.rate,
        promoApplied: { type: 'price', scheme: promo.schemeName, rate: promo.rate },
      }
    }

    // No price promo — restore base price if it was previously overridden
    const restore = item.promoApplied?.type === 'price' ? (item.basePrice ?? item.unitPrice) : item.unitPrice
    return {
      ...item,
      unitPrice: restore,
      total: item.qty * restore,
      promoApplied: null,
    }
  })

  // Manage free product rows
  const existingFreeIdx = newItems.findIndex((i) => i.isFreePromo && i.linkedToId === changedItemId)

  if (promo?.type === 'product') {
    // Determine which item to give for free
    const freeItemCode = promo.sameItem ? changedItem.item_code : promo.freeItem
    const freeItemName = promo.sameItem ? changedItem.item_name : (promo.freeItemName || promo.freeItem)

    if (!freeItemCode) {
      // No free item can be determined — remove any stale free row
      if (existingFreeIdx >= 0) {
        newItems = newItems.filter((i) => !(i.isFreePromo && i.linkedToId === changedItemId))
      }
    } else if (existingFreeIdx >= 0) {
      newItems = newItems.map((item, idx) =>
        idx === existingFreeIdx
          ? { ...item, qty: promo.freeQty, total: 0, promoSchemeName: promo.schemeName }
          : item
      )
    } else {
      const parentIdx = newItems.findIndex((i) => i.id === changedItemId)
      const freeRow = {
        id: Math.random().toString(36).slice(2, 9),
        item_code: freeItemCode,
        item_name: freeItemName + ' [FREE]',
        item_group: changedItem.item_group || '',
        qty: promo.freeQty,
        unitPrice: 0,
        basePrice: 0,
        total: 0,
        priceLevel: 'Standard',
        uom: changedItem.uom || 'Nos',
        serial_no: '',
        batch_no: '',
        isFreePromo: true,
        linkedToId: changedItemId,
        promoSchemeName: promo.schemeName,
      }
      newItems = [
        ...newItems.slice(0, parentIdx + 1),
        freeRow,
        ...newItems.slice(parentIdx + 1),
      ]
    }
  } else if (existingFreeIdx >= 0) {
    // Promo no longer applies — remove the free row
    newItems = newItems.filter((i) => !(i.isFreePromo && i.linkedToId === changedItemId))
  }

  return newItems
}

function schemeMatchesItem(scheme, itemCode, itemGroup) {
  const rows = scheme.items || []
  if (rows.length === 0) return true
  return rows.some((r) => {
    if (r.item_code && r.item_code !== itemCode) return false
    if (r.item_group && r.item_group !== itemGroup) return false
    return true
  })
}

function qtyInSlab(qty, slab) {
  const min = parseFloat(slab.min_qty) || 0
  const max = parseFloat(slab.max_qty) || 0
  return qty >= min && (max === 0 || qty <= max)
}
