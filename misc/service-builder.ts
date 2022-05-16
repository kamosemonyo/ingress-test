import { readFileSync, PathLike } from 'fs';
import { load } from 'js-yaml';
import { ENV_PRE, ENV_PROD } from '../lib/constants';
import { JavaService, Service } from './service';

export class ServiceBuilder {
  private static filepath:PathLike = './misc/projects.yml';

  static buildServices (env:string = ENV_PRE):Service[] {
    const services:Service[] = [
      ...this.buildJavaServices(env)
    // services.concat(this.buildDockerServices(env))
    ]
    
    return services;
  }

  static buildJavaServices (env:string = ENV_PRE):Service[] {
    return this.buildService('maven', env, this.buildJavaService);
  }

  static buildDockerServices (env:string = ENV_PRE):Service [] {
    return this.buildService('docker', env, this.buildDockerService)
  }

  static buildService(template:string, env:string, builderServiceFunction:Function) {
    if (env !== ENV_PRE && env !== ENV_PROD) {
      env = ENV_PRE
    }

    const config:any = this.readConfig()
    const services:Service[] = [];

    const templateServices = config.services.filter(
      (service:any) => service.template == template
    )

    for (const service of templateServices) {
      const templateService = builderServiceFunction(env, service)
      services.push(templateService);
    }

    return services;
  }

  static buildJavaService (env:string, service:any) {
    const replicas = service.replicas.pre;

    return new JavaService(
      service.name,
      replicas,
      service.propertiesFile,
      service.branches
    );
  }

  static buildDockerService (env:string, service:any) {
    const replicas = this.getReplicas(env, service);

    return new JavaService(
      service.name,
      replicas,
      service.propertiesFilePath,
      service.branches
    );
  }

  static getReplicas (env:string, service:any) {
    return (env == ENV_PRE) ? service.replicas.pre : service.replicas.prod;
  }

  static readConfig () {
    const ymlString = readFileSync(this.filepath, { encoding: 'utf-8' })
    const serviceConfig = load(ymlString)
    return serviceConfig
  }
}