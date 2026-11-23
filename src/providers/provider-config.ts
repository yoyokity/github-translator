/**
 * @file src/providers/provider-config.ts
 * provider 配置读取
 */

import { FeatureSet } from '../core/state';
import { getProviderConfig as readProviderConfig } from '../core/provider-protocol';

/** 读取当前设置并校验 */
export function getProviderConfig() {
    return readProviderConfig(FeatureSet, { withSignature: true });
}
