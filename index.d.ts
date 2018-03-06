import { Mongoose, Model } from 'mongoose';
import { pathsLoggedAlways, Action, Behaviour, Actor } from './src';

export interface LoggerConfig {
  url: string;
  collection: string;
}

export enum LoggerAction {
  updated = 'updated',
  created = 'created',
  deleted = 'deleted',
  fetched = 'fetched',
}

export class Logger {
  configuration: LoggerConfig;
  action: LoggerAction;
  stream: NodeJS.ReadWriteStream;
  static init(config: LoggerConfig): void;
  static waitUntilAvailable(callback: () => void): void;
  static waitUntilDrained(callback: () => void): void;
  static postConfig(): void;
  static attachSignalListeners(): void;
  static detachSignalListeners(): void;
  static stop(): Promise<void>;
  static gracefulStop(signal: number): void;
  static handleError(error: Error): void;
  static write(...args: any[]): void;
  static log(payload: any, callback: () => void): void;
}

export function getDelta(ev1: any, ev2: any, pathsToInclude: string[],
  modifiedPaths: string[], skippedPaths: string[], mongooseInstance: Mongoose): any;
export function setActor(model: Model<any>, actor: string, level: number, mongooseInstance: Mongoose): void;
export function loggableObject(): any;

export { pathsLoggedAlways, Action, Behaviour, Actor };
export function klLoggerPlugin(mongooseInstance: Mongoose): any;
