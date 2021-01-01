export default [
  {
    custom({ amount, original_payee }) {
      return original_payee.includes('ITUNES') && Number(amount) === -15.96;
    },
    newValue: 'Apple Music',
  },
];
