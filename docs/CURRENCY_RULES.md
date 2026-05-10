# Currency Standard

## 🪙 Unit: RUPEES

All monetary values in the SmartPrint platform (Database, APIs, Notifications, and Frontend) are stored and transmitted in **RUPEES** (INR).

### Rules
1. **No Conversion**: DO NOT divide or multiply by 100 anywhere in the application logic. 
2. **Database Schema**: Always use `DECIMAL(8, 2)` or equivalent to support precision up to 2 decimal places (e.g., ₹10.50).
3. **Frontend Formatting**: Use the `formatCurrency(amount)` utility in `lib/utils/index.ts`. It expects the amount in Rupees and formats it for the `en-IN` locale.

### Example
- **Correct**: An order for ₹10.00 is stored as `10.00` in the DB and passed as `10` to `formatCurrency`.
- **Incorrect**: Storing `1000` (paise) and dividing by 100 in the UI.

### Why?
Unifying on Rupees prevents common "off-by-100" bugs and ensures consistency across the entire stack, from SQL calculations to SMS alerts.
