import { strictEqual } from 'assert';
import { ENV_DEV } from '../../lib/constants';
import { ServiceBuilder } from '../../service/service-builder';

describe('Service builder tests', () => {
  test('Read yml config', () => {
    const services = ServiceBuilder.buildServices(ENV_DEV)
    strictEqual(services.length > 0, true)
  })

  test('yml service can be cast to TS Service', () => {
    const services = ServiceBuilder.buildServices(ENV_DEV)
    strictEqual(services[0].name !== undefined, true)
  })
})