// tslint:disable:no-non-null-assertion
import {
  ModelWithABunchOfIndexes,
  ModelWithAutogeneratedId,
  ModelWithGSI,
  ModelWithLSI,
  SimpleWithCompositePartitionKeyModel,
  SimpleWithPartitionKeyModel,
} from '../../../test/models'
import { INDEX_ACTIVE, INDEX_ACTIVE_CREATED_AT, INDEX_COUNT } from '../../../test/models/model-with-indexes.model'
import { Metadata } from './metadata'

describe('metadata', () => {
  let metaDataPartitionKey: Metadata<SimpleWithPartitionKeyModel>
  let metaDataComposite: Metadata<SimpleWithCompositePartitionKeyModel>
  let metaDataLsi: Metadata<ModelWithLSI>
  let metaDataGsi: Metadata<ModelWithGSI>
  let metaDataIndexes: Metadata<ModelWithABunchOfIndexes>
  let metaDataUuid: Metadata<ModelWithAutogeneratedId>

  beforeEach(() => {
    metaDataPartitionKey = new Metadata(SimpleWithPartitionKeyModel)
    metaDataComposite = new Metadata(SimpleWithCompositePartitionKeyModel)
    metaDataLsi = new Metadata(ModelWithLSI)
    metaDataGsi = new Metadata(ModelWithGSI)
    metaDataIndexes = new Metadata(ModelWithABunchOfIndexes)
    metaDataUuid = new Metadata(ModelWithAutogeneratedId)
  })

  it('forProperty', () => {
    const forId = metaDataPartitionKey.forProperty('id')
    expect(forId).toBeDefined()
    expect(forId!.key).toBeDefined()
    expect(forId!.name).toBe('id')
    expect(forId!.typeInfo).toBeDefined()
  })

  it('getKeysWithUUID', () => {
    const uuid = metaDataUuid.getKeysWithUUID()
    expect(uuid.length).toBe(1)
    expect(uuid[0].key).toBeDefined()
    expect(uuid[0].key!.uuid).toBeTruthy()
    expect(uuid[0].name).toBe('id')
  })

  it('getPartitionKey', () => {
    expect(metaDataPartitionKey.getPartitionKey()).toEqual('id')
    expect(metaDataGsi.getPartitionKey(INDEX_ACTIVE)).toEqual('active')
    expect(metaDataIndexes.getPartitionKey(INDEX_COUNT)).toEqual('myId')
    expect(metaDataIndexes.getPartitionKey(INDEX_ACTIVE_CREATED_AT)).toEqual('active')
  })

  it('getSortKey', () => {
    expect(metaDataPartitionKey.getSortKey()).toBe(null)
    expect(metaDataComposite.getSortKey()).toBe('creationDate')
    expect(metaDataLsi.getSortKey(INDEX_ACTIVE)).toBe('active')
    expect(() => metaDataGsi.getSortKey(INDEX_ACTIVE)).toThrow()
    expect(metaDataIndexes.getSortKey(INDEX_ACTIVE_CREATED_AT)).toBe('createdAt')
  })

  it('getIndexes', () => {
    expect(metaDataLsi.getIndexes()).toEqual([{ partitionKey: 'id', sortKey: 'active' }])
    expect(metaDataGsi.getIndexes()).toEqual([{ partitionKey: 'active' }])
    expect(metaDataIndexes.getIndexes()).toEqual([
      { partitionKey: 'active', sortKey: 'createdAt' },
      { partitionKey: 'myId', sortKey: 'count' },
    ])
  })

  it('getIndex', () => {
    expect(metaDataPartitionKey.getIndexes().length).toBe(0)
    expect(metaDataPartitionKey.getIndex('blub')).toBe(null)
    expect(metaDataIndexes.getIndex(INDEX_ACTIVE_CREATED_AT)).toEqual({
      partitionKey: 'active',
      sortKey: 'createdAt',
    })
  })
})
