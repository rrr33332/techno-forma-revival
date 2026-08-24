/**
 * SalesDriveService — adapter prepared for the future CRM integration.
 *
 * NOT connected yet: no API URL / key exists, so nothing is invented here.
 * When the credentials arrive, set the environment variables
 *
 *   SALESDRIVE_API_URL=
 *   SALESDRIVE_API_KEY=
 *
 * and implement the request inside `sendOrder` (marked below). No other part
 * of checkout, the account area or the order flow has to change: order
 * creation already calls `SalesDriveService.sendOrder(order)` and ignores a
 * disabled adapter.
 */

export type SalesDriveOrder = {
  orderNo: number;
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  comment: string | null;
  total: number;
  city: string | null;
  warehouse: string | null;
  warehouseAddress: string | null;
  items: {
    sku: string | null;
    name: string;
    variant: string | null;
    price: number;
    qty: number;
  }[];
};

export type SalesDriveResult = { sent: boolean; reason?: string };

export const SalesDriveService = {
  isEnabled(): boolean {
    return Boolean(process.env["SALESDRIVE_API_URL"] && process.env["SALESDRIVE_API_KEY"]);
  },

  async sendOrder(order: SalesDriveOrder): Promise<SalesDriveResult> {
    if (!SalesDriveService.isEnabled()) {
      // Stub mode — the order is stored locally and simply not forwarded.
      console.info(`[SalesDrive] disabled, order ${order.orderNo} not forwarded`);
      return { sent: false, reason: "disabled" };
    }

    // TODO(SalesDrive): build and POST the CRM payload here using
    // process.env['SALESDRIVE_API_URL'] and process.env['SALESDRIVE_API_KEY'].
    console.warn("[SalesDrive] credentials present but the adapter is not implemented yet");
    return { sent: false, reason: "not_implemented" };
  },
};
