import { Tags } from "aws-cdk-lib"

class KeyValues {
  static keys:any = {
    project:  { key: 'project', value: 'mm-pipeline' },
    buildResource:  { key: 'resource', value: 'mm-build' },
    containerResource:  { key: 'resource', value: 'mm-containers' },
    javaService:  { key: 'plang', value: 'mm-java' },
    kongService:  { key: 'plang', value: 'mm-kong' },
    angularService:  { key: 'plang', value: 'mm-angular' }
  }
}

export enum MoneyTagType {
  PIPELINE_RESOURCE,
  BUILD_RESOURCE,
  CONTAINER_RESOURCE,
  JAVA_SERVICE,
  KONG_SERVICE,
  ANGULAR_SERVICE
}

export class MoneyTags {

  static addPipelineTags (resource:any) {
    MoneyTags.addTag(MoneyTagType.PIPELINE_RESOURCE, resource);
    MoneyTags.addTag(MoneyTagType.BUILD_RESOURCE, resource);
    MoneyTags.addTag(MoneyTagType.JAVA_SERVICE, resource);
  }

  static addTag(type: MoneyTagType, resource:any) {
    const tag = MoneyTags.getTag(type);
    Tags.of(resource).add(tag['key'], tag['value']);
  }

  private static getTag (tagType: MoneyTagType):any {
    switch (tagType) {
      case MoneyTagType.BUILD_RESOURCE: return KeyValues.keys.buildResource;
      case MoneyTagType.CONTAINER_RESOURCE: return KeyValues.keys.containerResource;
      case MoneyTagType.JAVA_SERVICE: return KeyValues.keys.javaService;
      case MoneyTagType.KONG_SERVICE: return KeyValues.keys.kongService;
      case MoneyTagType.ANGULAR_SERVICE: return KeyValues.keys.angularService;
      case MoneyTagType.PIPELINE_RESOURCE: return KeyValues.keys.project;
      default: return KeyValues.keys.project;
    }
  }
}