import {
  AttributeMap,
  BatchWriteItemInput,
  BatchWriteItemOutput,
  WriteRequest,
  WriteRequests,
} from 'aws-sdk/clients/dynamodb'
import { Observable, of } from 'rxjs'
import { delay, map, mergeMap, tap } from 'rxjs/operators'
import { DynamoRx } from '../../../dynamo/dynamo-rx'
import { randomExponentialBackoffTimer } from '../../../helper'
import { Mapper } from '../../../mapper'
import { ModelConstructor } from '../../../model/model-constructor'
import { BatchWriteManyResponse } from './batch-write-many.response'

const MAX_BATCH_WRITE_ITEMS = 25

export class BatchWriteManyRequest<T> {
  private get toKey(): (item: T) => AttributeMap {
    if (!this._keyFn) {
      this._keyFn = Mapper.createToKeyFn(this.modelClazz)
    }
    return this._keyFn
  }

  readonly dynamoRx: DynamoRx
  readonly modelClazz: ModelConstructor<T>
  readonly tableName: string
  readonly itemsToProcess: WriteRequests

  private _keyFn: any

  constructor(dynamoRx: DynamoRx, modelClazz: ModelConstructor<T>, tableName: string) {
    this.dynamoRx = dynamoRx

    if (modelClazz === null || modelClazz === undefined) {
      throw new Error("please provide the model clazz for the request, won't work otherwise")
    }
    this.modelClazz = modelClazz
    this.tableName = tableName

    this.itemsToProcess = []
  }

  delete(items: T[]): BatchWriteManyRequest<T> {
    this.itemsToProcess.push(...items.map<WriteRequest>(item => ({ DeleteRequest: { Key: this.toKey(item) } })))
    return this
  }

  put(items: T[]): BatchWriteManyRequest<T> {
    this.itemsToProcess.push(
      ...items.map<WriteRequest>(item => ({ PutRequest: { Item: Mapper.toDb(item, this.modelClazz) } }))
    )
    return this
  }

  private execNextBatch(): Observable<BatchWriteManyResponse> {
    const batch = this.itemsToProcess.splice(0, MAX_BATCH_WRITE_ITEMS)
    const batchWriteItemInput: BatchWriteItemInput = {
      RequestItems: {
        [this.tableName]: batch,
      },
    }

    return this.dynamoRx.batchWriteItem(batchWriteItemInput).pipe(
      tap((batchWriteManyResponse: BatchWriteItemOutput) => {
        if (batchWriteManyResponse.UnprocessedItems) {
          this.itemsToProcess.unshift(...batchWriteManyResponse.UnprocessedItems[this.tableName])
        }
      }),
      map((batchWriteManyResponse: BatchWriteItemOutput) => ({
        remainingItems: this.itemsToProcess.length,
        capacityExceeded: !!batchWriteManyResponse.UnprocessedItems,
        consumedCapacity: batchWriteManyResponse.ConsumedCapacity,
      }))
    )
  }

  exec(backoffTimer = randomExponentialBackoffTimer, throttleTimeSlot = 1000): Observable<void> {
    let rBoT = backoffTimer(throttleTimeSlot)
    let backoffTime = 0
    return this.execNextBatch().pipe(
      mergeMap((r: BatchWriteManyResponse) => {
        if (!r.capacityExceeded) {
          rBoT = backoffTimer(throttleTimeSlot)
          backoffTime = 0
        } else {
          backoffTime = rBoT.next().value
        }
        return of(r).pipe(delay(backoffTime))
      }),
      mergeMap((r: BatchWriteManyResponse) => {
        if (r.remainingItems > 0) {
          return this.exec()
        } else {
          return of()
        }
      })
    )
  }
}
