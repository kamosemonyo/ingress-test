import { strictEqual } from 'assert';
import { JavaService } from '../../misc/service';
import { ServiceBuilder } from '../../misc/service-builder';

describe('Service builder tests', () => {
  test('Read yml config', () => {
    const services = ServiceBuilder.buildJavaServices()
    strictEqual(services.length, 1)
  })

  test('yml service can be cast to TS Service', () => {
    const services = ServiceBuilder.buildJavaServices()
    const javaService:JavaService = services[0]
    strictEqual(javaService.name, 'pfm-services')
  })
})