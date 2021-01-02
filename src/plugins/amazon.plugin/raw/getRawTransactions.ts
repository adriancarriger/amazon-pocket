import * as csvtojson from 'csvtojson';

export interface RawTransaction {
  /**
   * Order Id
   */
  Id: string;
  /**
   * Posted date
   */
  Date: string;
  /**
   * Transaction amount
   */
  Amount: string;
}

const getRawTransactions = async () => {
  const rawTransactions: RawTransaction[] = await csvtojson().fromFile(
    './src/rules/amazon-transactions.csv'
  );

  return rawTransactions;
};

export default getRawTransactions;
