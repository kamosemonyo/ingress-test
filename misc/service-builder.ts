import { readFileSync, PathLike } from 'fs';
import { load } from 'js-yaml';
import { JavaService, Service } from './service';

export class ServiceBuilder {
  private static filepath:PathLike = './misc/projects.yml';

  static buildJavaServices ():Service[] {
    return this.buildService('maven', this.buildJavaService);
  }

  static buildDockerServices ():Service [] {
    return this.buildService('docker', this.buildDockerService)
  }

  static buildService(template:string, builderCallback:Function) {
    const config:any = this.readConfig()
    const services:Service[] = [];

    const javaServices = config.services.filter(
      (service:any) => service.template == template
    )

    for (const service of javaServices) {
      const jService = builderCallback(service)
      services.push(jService);
    }

    return services;
  }

  static buildJavaService (service:any) {
    return new JavaService(
      service.name,
      service.replicas,
      service.propertiesFilePath,
      service.branches
    );
  }

  static buildDockerService (service:any) {
    return new JavaService(
      service.name,
      service.replicas,
      service.propertiesFilePath,
      service.branches
    );
  }

  static readConfig () {
    const ymlString = readFileSync(this.filepath, { encoding: 'utf-8' })
    const serviceConfig = load(ymlString)
    return serviceConfig
  }
}