import { create } from 'zustand'
import { applyPromos } from '../services/promotions'

const generateId = () => Math.random().toString(36).slice(2, 9)

const emptyBill = () => ({
  id: generateId(),
  items: [],
  discount: 0,
  discountType: 'amount', // 'amount' | 'percent'
  customer: null,
  note: '',
})

export const usePOSStore = create((set, get) => ({
  // Auth
  isLoggedIn: false,
  username: '',
  userFullName: '',
  erpnextUrl: '',
  posProfile: null,
  posProfileData: null,

  // UI
  theme: 'dark',
  showImages: false,
  touchMode: false,
  isOnline: true,
  currentScreen: 'login', // 'login' | 'pos' | 'settings'
  syncStatus: 'idle',     // 'idle' | 'syncing' | 'done' | 'error'
  syncVersion: 0,         // incremented on each sync so ItemGrid re-fetches stock

  // Items
  items: [],
  itemGroups: [],
  selectedGroup: 'All',
  searchQuery: '',

  // Bill
  currentBill: emptyBill(),
  heldBills: [],
  selectedRow: -1,
  billType: 'Retail',        // 'Retail' | 'Wholesale'
  billPaymentType: 'Cash',   // 'Cash' | 'Credit'

  // POS Session
  posOpeningEntry: null,   // ERPNext POS Opening Entry name
  openingCash: 0,          // cash amount at session start
  sessionOpenedBy: null,   // username who created the opening entry (may differ from current user)
  sessionStartDate: null,  // period_start_date from the opening entry (datetime string)
  soldInSession: {},       // { item_code: total_qty_sold } — real-time local adjustment

  // Promotional Schemes
  promoSchemes: [],         // active ERPNext Promotional Scheme docs (fetched on login/sync)

  // Returns
  returnCredit: 0,          // credit amount from a pending return invoice
  returnInvoiceName: null,  // ERPNext name of the submitted return invoice

  // Modals
  itemDialog: null,        // { item, levels[] } — unified item/price/qty dialog
  priceLevelModal: null,   // kept for compat, no longer triggered
  qtyModal: null,          // kept for compat, no longer triggered
  paymentModal: false,
  showOpeningModal: false,
  showSummaryModal: false,
  showReturnModal: false,
  settingsOpen: false,

  // Actions
  setLoggedIn: (val) => set({ isLoggedIn: val }),
  setUsername: (u) => set({ username: u }),
  setUserFullName: (n) => set({ userFullName: n }),
  setErpnextUrl: (url) => set({ erpnextUrl: url }),
  setPosProfile: (p) => set({ posProfile: p }),
  setPosProfileData: (d) => set({ posProfileData: d }),
  setPromoSchemes: (schemes) => {
    const loaded = schemes || []
    console.log('[PROMO] loaded', loaded.length, 'schemes')
    set((state) => {
      // Re-evaluate all existing bill items with the new schemes
      let newItems = state.currentBill.items
      if (loaded.length > 0) {
        const mainItems = newItems.filter((i) => !i.isFreePromo)
        for (const item of mainItems) {
          newItems = applyPromos(newItems, item.id, loaded)
        }
      }
      return {
        promoSchemes: loaded,
        currentBill: { ...state.currentBill, items: newItems },
      }
    })
  },
  setTheme: (t) => {
    set({ theme: t })
    document.documentElement.classList.toggle('dark', t === 'dark')
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },
  setShowImages: (v) => set({ showImages: v }),
  setTouchMode: (v) => set({ touchMode: v }),
  setOnline: (v) => set({ isOnline: v }),
  setCurrentScreen: (s) => set({ currentScreen: s }),
  setSyncStatus: (s) => set({ syncStatus: s }),
  incrementSyncVersion: () => set((state) => ({ syncVersion: state.syncVersion + 1, soldInSession: {} })),
  lockScreen: () => set({ currentScreen: 'login' }),  // lock without clearing session data

  setItems: (items) => set({ items }),
  setItemGroups: (groups) => set({ itemGroups: groups }),
  setSelectedGroup: (g) => set({ selectedGroup: g }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  // Bill operations
  addItemToBill: (item, priceLevel, qty = 1, serialNo = '', batchNo = '') => {
    const price = priceLevel ? priceLevel.our_price : (item.price_list_rate ?? item.standard_rate ?? 0)
    const levelName = priceLevel ? priceLevel.level : 'Standard'
    set((state) => {
      const { promoSchemes } = state
      // Items with serial numbers are always separate rows (each unit is unique)
      const canMerge = !serialNo && !batchNo
      const existing = canMerge && state.currentBill.items.find(
        (i) => i.item_code === item.item_code && i.priceLevel === levelName && !i.serial_no && !i.batch_no && !i.isFreePromo
      )

      let newItems
      let changedId

      if (existing) {
        const newQty = existing.qty + qty
        changedId = existing.id
        newItems = state.currentBill.items.map((i) =>
          i === existing ? { ...i, qty: newQty, total: newQty * (i.basePrice ?? i.unitPrice) } : i
        )
      } else {
        const newItem = {
          id: generateId(),
          item_code:  item.item_code,
          item_name:  item.item_name,
          item_group: item.item_group || '',
          qty,
          unitPrice:  price,
          basePrice:  price,   // always the original, never changed by promos
          total:      qty * price,
          priceLevel: levelName,
          uom:        item.stock_uom || 'Nos',
          serial_no:  serialNo || '',
          batch_no:   batchNo  || '',
        }
        changedId = newItem.id
        newItems = [...state.currentBill.items, newItem]
      }

      if (promoSchemes.length > 0) {
        newItems = applyPromos(newItems, changedId, promoSchemes)
      }

      const changedIdx = newItems.findIndex((i) => i.id === changedId)
      return {
        currentBill: { ...state.currentBill, items: newItems },
        selectedRow: changedIdx >= 0 ? changedIdx : newItems.length - 1,
      }
    })
  },

  updateItemQty: (id, qty) => {
    if (qty <= 0) {
      get().removeItem(id)
      return
    }
    set((state) => {
      const { promoSchemes } = state
      // Use basePrice for total so promos can re-evaluate cleanly
      let newItems = state.currentBill.items.map((i) =>
        i.id === id ? { ...i, qty, total: qty * (i.basePrice ?? i.unitPrice) } : i
      )
      if (promoSchemes.length > 0) {
        newItems = applyPromos(newItems, id, promoSchemes)
      }
      return { currentBill: { ...state.currentBill, items: newItems } }
    })
  },

  removeItem: (id) => {
    set((state) => ({
      currentBill: {
        ...state.currentBill,
        // Also remove any free promo rows that were linked to this item
        items: state.currentBill.items.filter((i) => i.id !== id && i.linkedToId !== id),
      },
    }))
  },

  setDiscount: (discount, type = 'amount') => {
    set((state) => ({ currentBill: { ...state.currentBill, discount, discountType: type } }))
  },

  setCustomer: (customer) => {
    set((state) => ({ currentBill: { ...state.currentBill, customer } }))
  },

  setReturnCredit: (amount, invoiceName) => set({ returnCredit: amount, returnInvoiceName: invoiceName }),
  clearReturnCredit: () => set({ returnCredit: 0, returnInvoiceName: null }),

  newBill: () => set({ currentBill: emptyBill(), selectedRow: -1, billPaymentType: 'Cash', returnCredit: 0, returnInvoiceName: null }),

  holdBill: () => {
    const bill = get().currentBill
    if (bill.items.length === 0) return
    set((state) => ({
      heldBills: [...state.heldBills, { ...bill, heldAt: new Date().toISOString() }],
      currentBill: emptyBill(),
      selectedRow: -1,
    }))
  },

  recallBill: (id) => {
    set((state) => {
      const held = state.heldBills.find((b) => b.id === id)
      if (!held) return {}
      const current = state.currentBill
      const newHeld = state.heldBills.filter((b) => b.id !== id)
      if (current.items.length > 0) newHeld.push({ ...current, heldAt: new Date().toISOString() })
      return { heldBills: newHeld, currentBill: held, selectedRow: -1 }
    })
  },

  setSelectedRow: (i) => set({ selectedRow: i }),
  setBillType: (type) => set({ billType: type }),
  toggleBillType: () => set((state) => ({ billType: state.billType === 'Retail' ? 'Wholesale' : 'Retail' })),
  setBillPaymentType: (type) => set({ billPaymentType: type }),
  toggleBillPaymentType: () => set((state) => ({ billPaymentType: state.billPaymentType === 'Cash' ? 'Credit' : 'Cash' })),

  // Item dialog
  openItemDialog: (item, levels) => set({ itemDialog: { item, levels } }),
  closeItemDialog: () => set({ itemDialog: null }),

  // POS Session actions
  setPosOpeningEntry: (name, cash, openedBy, startDate) => set({ posOpeningEntry: name, openingCash: Number(cash) || 0, sessionOpenedBy: openedBy || null, sessionStartDate: startDate || null }),
  clearPOSSession: () => set({ posOpeningEntry: null, openingCash: 0, sessionOpenedBy: null, sessionStartDate: null, soldInSession: {} }),
  addSoldToSession: (items) => set((state) => {
    const updated = { ...state.soldInSession }
    for (const item of items) {
      if (item.qty > 0) updated[item.item_code] = (updated[item.item_code] || 0) + item.qty
    }
    return { soldInSession: updated }
  }),

  // Modals
  openPriceLevelModal: (item, priceLevels) => set({ priceLevelModal: { item, priceLevels } }),
  closePriceLevelModal: () => set({ priceLevelModal: null }),
  openQtyModal: (item, priceLevel) => set({ qtyModal: { item, priceLevel } }),
  closeQtyModal: () => set({ qtyModal: null }),
  openPaymentModal: () => set({ paymentModal: true }),
  closePaymentModal: () => set({ paymentModal: false }),
  setShowOpeningModal: (v) => set({ showOpeningModal: v }),
  setShowSummaryModal: (v) => set({ showSummaryModal: v }),
  setShowReturnModal: (v) => set({ showReturnModal: v }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),

  // Computed getters
  getSubTotal: () => get().currentBill.items.reduce((sum, i) => sum + i.total, 0),
  getDiscountAmount: () => {
    const { discount, discountType } = get().currentBill
    const sub = get().getSubTotal()
    if (discountType === 'percent') return (sub * discount) / 100
    return discount || 0
  },
  getGrandTotal: () => {
    const sub = get().getSubTotal()
    const disc = get().getDiscountAmount()
    return Math.max(0, sub - disc)
  },
}))
