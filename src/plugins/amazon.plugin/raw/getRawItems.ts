import * as csvtojson from 'csvtojson';

export interface RawItem {
  'Order Date': string;
  'Order ID': string;
  Title: string;
  Category: string;
  'ASIN/ISBN': string;
  'UNSPSC Code': string;
  Website: string;
  'Release Date': string;
  Condition: string;
  Seller: string;
  'Seller Credentials': string;
  'List Price Per Unit': string;
  'Purchase Price Per Unit': string;
  Quantity: string;
  'Payment Instrument Type': string;
  'Purchase Order Number': string;
  'PO Line Number': string;
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
  'Item Subtotal': string;
  'Item Subtotal Tax': string;
  'Item Total': string;
  'Tax Exemption Applied': string;
  'Tax Exemption Type': string;
  'Exemption Opt-Out': string;
  'Buyer Name': string;
  Currency: string;
  'Group Name': string;
}

const getRawItems = async () => {
  const rawItems: RawItem[] = await csvtojson().fromFile('./data/amazon-items.csv');

  return rawItems;
};

export default getRawItems;
