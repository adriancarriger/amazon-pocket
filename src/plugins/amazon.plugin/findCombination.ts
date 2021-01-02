import { AmazonItem } from './amazon.plugin';

export interface FindCombinationProps {
  charge: number;
  items: AmazonItem[];
  orderTotal: number;
}

const getCents = (item: number) => Number((item * 100).toFixed());
const getItemCents = (item: AmazonItem) => getCents(Number(item['Item Total'].slice(1)));

const findCombination = ({ charge, items, orderTotal }: FindCombinationProps) => {
  const targetAmount = getCents(charge);

  const orderTotalCents = getCents(orderTotal);
  const total = items.reduce((previous, current) => previous + getItemCents(current), 0);

  if (total === targetAmount) {
    return items;
  }

  const validItems: AmazonItem[] = items
    .map((item) => ({ ...item, cents: getItemCents(item) }))
    .filter((item) => item.cents <= targetAmount)
    .sort((a, b) => a.cents - b.cents);

  if (validItems.some((item) => item.cents === targetAmount)) {
    return [items[0]];
  }

  const results = subsetSum(validItems, targetAmount);

  if (results.length === 0) {
    return;
  }

  if (results.length === 1) {
    return results[0];
  }

  console.log('Several combinations', results);
  console.log('\n\n');
};

export default findCombination;

const subsetSum = (numbers: AmazonItem[], target: number, partial?: AmazonItem[]) => {
  const options: AmazonItem[][] = [];

  const subsetSumBase = (numbers: AmazonItem[], target: number, partial?: AmazonItem[]) => {
    const sum = (partial || []).reduce((previous, current) => previous + (current?.cents || 0), 0);

    if (sum === target) {
      if (partial) {
        options.push(partial);
      }
    }

    if (sum >= target) {
      return;
    }

    for (let i = 0; i < numbers.length; i++) {
      const number = numbers[i];
      const remaining = numbers.slice(i + 1);
      subsetSumBase(remaining, target, [...(partial || []), number]);
    }
  };

  subsetSumBase(numbers, target, partial);

  return options;
};
