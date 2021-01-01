import * as csvtojson from 'csvtojson';

export interface RawRefund {
  'Order ID': string;
  'Order Date': string;
  Title: string;
  Category: string;
  'ASIN/ISBN': string;
  Website: string;
  'Purchase Order Number': string;
  'Refund Date': string;
  'Refund Condition': string;
  'Refund Amount': string;
  'Refund Tax Amount': string;
  'Tax Exemption Applied': string;
  'Refund Reason': string;
  Quantity: string;
  Seller: string;
  'Seller Credentials': string;
  'Buyer Name': string;
  'Group Name': string;
}

const getRawRefunds = async () => {
  const rawRefunds: RawRefund[] = await csvtojson().fromFile('./data/amazon-refunds.csv');

  return rawRefunds;
};

export default getRawRefunds;
