'use strict';

import { randomBytes } from 'crypto';
import web3Utils from 'web3-utils';
import { abi, Transaction } from 'thor-devkit';
import { FilterOpts, Wallet, TxObj } from './types';
import { ProviderRpcError, Subscription } from './eip1193';
import { Provider } from './provider';
import { ErrCode } from './error';

export const toSubscription = function (ret: any, id: string): Subscription {
	return {
		type: 'eth_subscription',
		data: {
			subscription: id,
			result: ret,
		}
	}
}

/**
 * Convert the input into either block id or block number compatible with connex.thor.block()
 * @param {hex | 'earliest' | 'latest' } input
 * @returns {string | number | null | undefined} Return null not recognized and undefined if input === 'latest'
 */
export function parseBlockNumber(input: string): string | number | undefined | null {
	// Return block id;
	if (web3Utils.isHexStrict(input) && input.length == 66) {
		return input;
	}

	// Convert block number;
	if (web3Utils.isHexStrict(input)) { return web3Utils.hexToNumber(input); }
	else if (input === 'earliest') { return 0; }
	else if (input === 'latest') { return undefined; }

	return null;
}

export function toBytes32(hex: string): string {
	return web3Utils.padLeft(hex, 64);
}

export function hexToNumber(hex: string): number {
	return web3Utils.hexToNumber(hex);
}

export function toHex(value: number | string): string {
	return web3Utils.toHex(value);
}

export function randAddr(): string {
	return '0x' + randomBytes(20).toString('hex');
}

export function isHexStrict(hex: string) {
	return web3Utils.isHexStrict(hex);
}

export function genRevertReason(output: Connex.VM.Output): string {
	output.revertReason = decodeRevertReason(output.data);
	
	const errorSig = '0x08c379a0';
	let errMsg = output.revertReason || output.vmError || output.data;

	if (!errMsg.startsWith('0x')) {
		// encode error message to allow sendTxCallback to decode later
		errMsg = abi.encodeParameter('string', errMsg);
	}

	if (!errMsg.startsWith(errorSig)) {
		errMsg = errorSig + errMsg.slice(2);
	}

	return errMsg;
}

export function toFilterCriteria(args: FilterOpts): Connex.Thor.Filter.Criteria<"event">[] {
	const setCriteria = (address?: string, topics?: any) => {
		const c: Connex.Thor.Filter.Criteria<"event"> = {};

		if (address) { c.address = address };
		if (topics) {
			if (topics[0]) { c.topic0 = topics[0]; }
			if (topics[1]) { c.topic1 = topics[1]; }
			if (topics[2]) { c.topic2 = topics[2]; }
			if (topics[3]) { c.topic3 = topics[3]; }
		}

		return c;
	}

	let ret: Connex.Thor.Filter.Criteria<"event">[] = [];
	if (!(args.address && Array.isArray(args.address))
		&& !(args.topics && args.topics[0] && Array.isArray(args.topics[0]))
	) {
		ret = [setCriteria(args.address, args.topics)];
	} else if (Array.isArray(args.address) || Array.isArray(args.topics)) {
		let len = 0;
		if (args.address) { len = args.address.length; }
		if (args.topics) { len = args.topics.length; }

		for (let i = 0; i < len; i++) {
			const addr = args.address ?
				(Array.isArray(args.address) ? args.address[i] : args.address) : undefined;
			const topics = args.topics ? args.topics[i] : undefined;
			ret.push(setCriteria(addr, topics));
		}
	}

	return ret;
}

export const wait = (ms: number) => {
	return new Promise(resolve => {
		setTimeout(() => resolve(true), ms);
	});
}

/** params for tx construction */
const txParams = {
	expiration: 18,
	gasPriceCoef: 0
}

export const signTransaction = async (ethTx: TxObj, wallet: Wallet, provider: Provider): Promise<string> => {
	if (wallet.list.length == 0) {
		return Promise.reject('Empty wallet');
	}

	const clauses = [{
		to: ethTx.to ? ethTx.to.toLowerCase() : null,
		value: ethTx.value ? ethTx.value : '0x0',
		data: ethTx.data ? ethTx.data : '0x',
	}];

	const gas = ethTx.gas || await provider.request({
		method: 'eth_estimateGas',
		params: [ethTx]
	});

	const chainId = provider.chainTag;

	const best = await provider.request({
		method: 'eth_getBlockByNumber',
		params: ['latest']
	});

	const txBody: Transaction.Body = {
		chainTag: chainId,
		blockRef: best.hash.slice(0, 18),
		expiration: txParams.expiration,
		clauses,
		gasPriceCoef: txParams.gasPriceCoef,
		gas,
		dependsOn: null,
		nonce: '0x' + randomBytes(8).toString('hex')
	}

	const tx = new Transaction(txBody)
	tx.signature = await wallet.list[0].sign(tx.signingHash());

	return '0x' + tx.encode().toString('hex');
}

export function decodeRevertReason(data: string): string {
	const errSig = '0x08c379a0'
	try {
		if (data.startsWith(errSig)) {
			return abi.decodeParameter('string', '0x' + data.slice(errSig.length)) as string
		}
		return ''
	} catch {
		return ''
	}
}

// export function encodeRevertReason(msg: string): string {
// 	const errorSig = '0x08c379a0'
// 	try {
// 		return errorSig + abi.encodeParameter('string', msg)
// 	} catch { return '' }
// }

export function toInvalidParamsErr(msg: string): ProviderRpcError {
	return new ProviderRpcError(ErrCode.InvalidParams, msg);
}

export function toInternalJsonRpcErr(msg: string): ProviderRpcError {
	return new ProviderRpcError(ErrCode.InternalError, msg);
}

export function getErrMsg(err: any): string {
	let msg: string = '';
	if (typeof err === 'string') {
		msg = err;
	} else if (err.message) {
		msg = err.message;
	}

	return msg;
}