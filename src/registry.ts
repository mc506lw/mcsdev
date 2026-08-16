import * as path from 'path';
import { Prefs } from './config';
import { mcsdevHome, readJson, writeJson } from './util/fsx';

/** 实例元数据（全局注册表，按 MC 版本索引，见 DESIGN.md §3.2） */
export interface InstanceMeta {
  name: string;
  core: 'paper' | 'folia';
  mcVersion: string;
  dir: string;
  javaBin?: string;
  port: number;
  overrides?: Partial<Prefs>;
  createdAt: string;
}

function registryFile(): string {
  return path.join(mcsdevHome(), 'instances.json');
}

export function listInstances(): InstanceMeta[] {
  return readJson<InstanceMeta[]>(registryFile(), []);
}

export function getInstance(name: string): InstanceMeta | undefined {
  return listInstances().find((i) => i.name === name);
}

export function byVersion(version: string): InstanceMeta[] {
  return listInstances().filter((i) => i.mcVersion === version);
}

export function addInstance(meta: InstanceMeta): void {
  const all = listInstances().filter((i) => i.name !== meta.name);
  all.push(meta);
  writeJson(registryFile(), all);
}

export function removeInstance(name: string): void {
  writeJson(
    registryFile(),
    listInstances().filter((i) => i.name !== name)
  );
}