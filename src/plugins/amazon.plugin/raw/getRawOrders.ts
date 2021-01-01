import * as csvtojson from 'csvtojson';

export interface RawOrder {
  'Order Date': string;
  'Order ID': string;
  'Payment Instrument Type': string;
  Website: string;
  'Purchase Order Number': string;
  'Ordering Customer Email': string;
  'Shipment Date': string;
  'Shipping Address Name': string;
  'Shipping Address Street 1': string;
  'Shipping Address Street 2': string;
  'Shipping Address City': string;
  'Shipping Address State': string;
  'Shipping Address Zip': string;
  'Order Status': string;
  'Carrier Name & Tracking Number': string;
  Subtotal: string;
  'Shipping Charge': string;
  'Tax Before Promotions': string;
  'Total Promotions': string;
  'Tax Charged': string;
  'Total Charged': string;
  'Buyer Name': string;
  'Group Name': string;
}

const getRawOrders = async () => {
  const rawOrders: RawOrder[] = await csvtojson().fromFile('./data/amazon-orders.csv');

  return rawOrders;
};

export default getRawOrders;
