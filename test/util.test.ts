import { toValidConstructName } from '../lib/util';

test('toValidConstructName', () => {
  expect(toValidConstructName('abc')).toEqual('Abc');
  expect(toValidConstructName('abc-service')).toEqual('Abc-Service');
  expect(toValidConstructName('abc-def-service')).toEqual('Abc-Def-Service');
  expect(toValidConstructName('abc_def_service')).toEqual('Abc-Def-Service');
});
