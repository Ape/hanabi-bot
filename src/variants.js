import * as https from 'https';
import { CLUE } from './constants.js';

/**
 * @typedef {import('./types.js').Clue} Clue
 * @typedef {import('./types.js').Identity} Identity
 * 
 * @typedef Variant
 * @property {number} id
 * @property {string} name
 * @property {string[]} suits
 * @property {number} [specialRank]
 * @property {boolean} [specialRankAllClueColors]
 * @property {boolean} [specialRankAllClueRanks]
 * @property {boolean} [specialRankNoClueColors]
 * @property {boolean} [specialRankNoClueRanks]
 * @property {boolean} [specialRankDeceptive]
 * @property {boolean} [chimneys]
 * @property {boolean} [funnels]
 * @property {number} [criticalRank]
 * @property {number} [specialRank]
 * @property {number[]} [clueRanks]
 */

const variantsURL = 'https://raw.githubusercontent.com/Hanabi-Live/hanabi-live/main/packages/game/src/json/variants.json';
const coloursURL = 'https://raw.githubusercontent.com/Hanabi-Live/hanabi-live/main/packages/game/src/json/suits.json';

const whitish = /White|Gray|Light|Null/;
const rainbowish = /Rainbow|Omni/;
const brownish = /Brown|Muddy|Cocoa|Null/;
const pinkish = /Pink|Omni/;
const dark = /Black|Dark|Gray|Cocoa/;
export const variantRegexes = {whitish, rainbowish, brownish, pinkish, dark};

/** @type {Promise<Variant[]>} */
const variants_promise = new Promise((resolve, reject) => {
	https.get(variantsURL, (res) => {
		const { statusCode } = res;

		if (statusCode !== 200) {
			// Consume response data to free up memory
			res.resume();
			reject(`Failed to retrieve variants. Status Code: ${statusCode}`);
		}

		res.setEncoding('utf8');

		let rawData = '';
		res.on('data', (chunk) => { rawData += chunk; });
		res.on('end', () => {
			try {
				const parsedData = JSON.parse(rawData);
				resolve(parsedData);
			} catch (e) {
				reject(e.message);
			}
		});
	}).on('error', (e) => {
		console.error(`Error when retrieving variants: ${e.message}`);
	});
});

/** @type {Promise<Array>} */
const colours_promise = new Promise((resolve, reject) => {
	https.get(coloursURL, (res) => {
		const { statusCode } = res;

		if (statusCode !== 200) {
			// Consume response data to free up memory
			res.resume();
			reject(`Failed to retrieve colors. Status Code: ${statusCode}`);
		}

		res.setEncoding('utf8');

		let rawData = '';
		res.on('data', (chunk) => { rawData += chunk; });
		res.on('end', () => {
			try {
				const parsedData = JSON.parse(rawData);
				resolve(parsedData);
			} catch (e) {
				reject(e.message);
			}
		});
	}).on('error', (e) => {
		console.error(`Error when retrieving colors: ${e.message}`);
	});
});

/**
 * Returns a variant's properties, given its name.
 * @param {string} name
 */
export async function getVariant(name) {
	const variants = await variants_promise;
	return variants.find(variant => variant.name === name);
}

export let shortForms = /** @type {string[]} */ (['r', 'y', 'g', 'b', 'p']);

/**
 * Edits shortForms to have the correct acryonyms.
 * @param {Variant} variant
 */
export async function getShortForms(variant) {
	const colors = await colours_promise;
	const abbreviations = [];
	for (const suitName of variant.suits) {
		if (['Black', 'Pink', 'Brown'].includes(suitName)) {
			abbreviations.push(['k', 'i', 'n'][['Black', 'Pink', 'Brown'].indexOf(suitName)]);
		} else {
			const abbreviation = colors.find(color => color.name === suitName)?.abbreviation ?? suitName.charAt(0);
			if (abbreviations.includes(abbreviation.toLowerCase()))
				abbreviations.push(suitName.toLowerCase().split('').find(char => !abbreviations.includes(char)));
			else
				abbreviations.push(abbreviation.toLowerCase());

		}
	}
	shortForms = abbreviations;
}

/**
 * Returns whether the card would be touched by the clue.
 * @param {Identity} card
 * @param {Variant} variant
 * @param {Omit<Clue, 'target'>} clue
 */
export function cardTouched(card, variant, clue) {
	const { type, value } = clue;
	const { suitIndex, rank } = card;
	const suit = variant.suits[suitIndex];

	if (suit === 'Null' || suit === 'Dark Null')
		return false;
	else if (suit === 'Omni' || suit === 'Dark Omni')
		return true;

	if (type === CLUE.COLOUR) {
		if (suit.match(variantRegexes.whitish)) {
			return false;
		}
		else if (suit.match(variantRegexes.rainbowish)) {
			return true;
		}
		else if (suit === 'Prism' || suit === 'Dark Prism') {
			const colourlessCount = variant.suits.filter(s => s.match(rainbowish) || s.match(whitish) || s.match(/Prism/)).length;
			return ((rank - 1) % (variant.suits.length - colourlessCount)) === value;
		}

		if (rank === variant.specialRank) {
			if (variant.specialRankAllClueColors)
				return true;
			else if (variant.specialRankNoClueColors)
				return false;
		}

		return suitIndex === value;
	}
	else if (type === CLUE.RANK) {
		if (suit.match(variantRegexes.brownish))
			return false;
		else if (suit.match(variantRegexes.pinkish))
			return true;

		if (rank === variant.specialRank) {
			if (variant.specialRankAllClueRanks)
				return true;
			if (variant.specialRankNoClueRanks)
				return false;

			if (variant.specialRankDeceptive)
				return (suitIndex % 4) + (variant.specialRank === 1 ? 2 : 1) === value;
		}

		if (variant.chimneys)
			return rank >= value;
		if (variant.funnels)
			return rank <= value;

		return rank === value;
	}
}

/**
 * Returns whether the clue is possible to give. For example, white cannot be clued.
 * @param {Variant} variant
 * @param {Omit<Clue, 'target'>} clue
 */
export function isCluable(variant, clue) {
	const { type, value } = clue;

	if (type === CLUE.COLOUR && (
		variant.suits[value].match(variantRegexes.whitish)
		|| variant.suits[value].match(variantRegexes.rainbowish)
	))
		return false;
	if (type === CLUE.RANK && !(variant.clueRanks?.includes(value) ?? true))
		return false;
	return true;
}

/**
 * Returns the total number of cards for an identity.
 * @param {Variant} variant
 * @param {Identity} identity
 */
export function cardCount(variant, { suitIndex, rank }) {
	if (variant.suits[suitIndex].match(variantRegexes.dark))
		return 1;

	if (variant.criticalRank === rank)
		return 1;

	return [3, 2, 2, 2, 1][rank - 1];
}
