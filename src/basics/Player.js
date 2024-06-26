import { unknownIdentities } from './hanabi-util.js';
import * as Utils from '../tools/util.js';
import * as Elim from './player-elim.js';

import logger from '../tools/logger.js';
import { logCard } from '../tools/log.js';

/**
 * @typedef {import('./State.js').State} State
 * @typedef {import('./Hand.js').Hand} Hand
 * @typedef {import('./Card.js').Card} Card
 * @typedef {import('./Card.js').BasicCard} BasicCard
 * @typedef {import('./IdentitySet.js').IdentitySet} IdentitySet
 * @typedef {import('../types.js').Identity} Identity
 * @typedef {import('../types.js').Link} Link
 * @typedef {import('../types.js').WaitingConnection} WaitingConnection
 */

export class Player {
	card_elim = Elim.card_elim;
	refresh_links = Elim.refresh_links;
	find_links = Elim.find_links;
	good_touch_elim = Elim.good_touch_elim;
	reset_card = Elim.reset_card;
	restore_elim = Elim.restore_elim;

	/** @type {number[]} */
	hypo_stacks;

	/**
	 * @param {number} playerIndex
	 * @param {IdentitySet} all_possible
	 * @param {IdentitySet} all_inferred
	 * @param {number[]} hypo_stacks
	 * @param {Card[]} [thoughts]
	 * @param {Link[]} [links]
	 * @param {Set<number>} unknown_plays
	 * @param {WaitingConnection[]} waiting_connections
	 * @param {Record<string, number[]>} elims
	 */
	constructor(playerIndex, all_possible, all_inferred, hypo_stacks, thoughts = [], links = [], unknown_plays = new Set(), waiting_connections = [], elims = {}) {
		this.playerIndex = playerIndex;

		this.thoughts = thoughts;
		this.links = links;

		this.hypo_stacks = hypo_stacks;
		this.all_possible = all_possible;
		this.all_inferred = all_inferred;

		/**
		 * The orders of playable cards whose identities are not known, according to each player. Used for identifying TCCMs.
		 */
		this.unknown_plays = unknown_plays;

		this.waiting_connections = waiting_connections;
		this.elims = elims;
	}

	clone() {
		return new Player(this.playerIndex,
			this.all_possible,
			this.all_inferred,
			this.hypo_stacks.slice(),
			this.thoughts.map(infs => infs.clone()),
			this.links.map(link => Utils.objClone(link)),
			this.unknown_plays,
			Utils.objClone(this.waiting_connections),
			Utils.objClone(this.elims));
	}

	shallowCopy() {
		return new Player(this.playerIndex,
			this.all_possible,
			this.all_inferred,
			this.hypo_stacks,
			this.thoughts,
			this.links,
			this.unknown_plays,
			this.waiting_connections,
			this.elims);
	}

	/**
	 * Returns whether they think the given player is locked (i.e. every card is clued, chop moved, or finessed AND not loaded).
	 * @param {State} state
	 * @param {number} playerIndex
	 */
	thinksLocked(state, playerIndex) {
		return state.hands[playerIndex].every(c => this.thoughts[c.order].saved) && !this.thinksLoaded(state, playerIndex);
	}

	/**
	 * Returns whether they they think the given player is loaded (i.e. has a known playable or trash).
	 * @param {State} state
	 * @param {number} playerIndex
	 */
	thinksLoaded(state, playerIndex) {
		return this.thinksPlayables(state, playerIndex).length > 0 || this.thinksTrash(state, playerIndex).length > 0;
	}

	/**
	 * Returns playables in the given player's hand, according to this player.
	 * @param {State} state
	 * @param {number} playerIndex
	 */
	thinksPlayables(state, playerIndex) {
		const linked_orders = this.linkedOrders(state);

		// TODO: Revisit if the card identity being known is relevant?
		// (e.g. if I later discover that I did not have a playable when I thought I did)
		return Array.from(state.hands[playerIndex].filter(c => {
			const card = this.thoughts[c.order];
			return !linked_orders.has(c.order) &&
				card.possibilities.every(p => (card.chop_moved ? state.isBasicTrash(p) : false) || state.isPlayable(p)) &&	// cm cards can ignore trash ids
				card.possibilities.some(p => state.isPlayable(p)) &&	// Exclude empty case
				card.matches_inferences();
		}));
	}

	/**
	 * Finds trash in the given hand, according to this player.
	 * @param {State} state
	 * @param {number} playerIndex
	 */
	thinksTrash(state, playerIndex) {
		/** @type {(identity: Identity, order: number) => boolean} */
		const visible_elsewhere = (identity, order) =>
			state.hands.flat().some(c => {
				const card = this.thoughts[c.order];

				return card.matches(identity, { infer: true }) &&
					(c.clued || card.finessed) &&
					c.order !== order &&
					!this.links.some(link => link.cards.some(lc => lc.order === order));
			});

		return Array.from(state.hands[playerIndex].filter(c => {
			const poss = this.thoughts[c.order].possibilities;

			// Every possibility is trash or duplicated somewhere
			const trash = poss.every(p => state.isBasicTrash(p) || visible_elsewhere(p, c.order));

			if (trash)
				logger.debug(`order ${c.order} is trash, poss ${poss.map(logCard).join()}, ${poss.map(p => state.isBasicTrash(p) + '|' + visible_elsewhere(p, c.order)).join()}`);

			return trash;
		}));
	}

	/**
	 * Finds the best discard in a locked hand.
	 * Breaks ties using the leftmost card.
	 * @param {State} state
	 * @param {Hand} hand
	 */
	lockedDiscard(state, hand) {
		// If any card's crit% is 0
		const crit_percents = Array.from(hand.map(c => {
			const poss = this.thoughts[c.order].possibilities;
			const percent = poss.filter(p => state.isCritical(p)).length / poss.length;

			return { card: c, percent };
		})).sort((a, b) => a.percent - b.percent);

		const least_crits = crit_percents.filter(({ percent }) => percent === crit_percents[0].percent);

		/**
		 * @param {{suitIndex: number, rank: number}} possibility
		 * @param {boolean} all_crit
		 */
		const distance = ({ suitIndex, rank }, all_crit) => {
			const crit_distance = (all_crit ? rank * 5 : 0) + rank - this.hypo_stacks[suitIndex];
			return crit_distance < 0 ? 5 : crit_distance;
		};

		const { card: furthest_card } = Utils.maxOn(least_crits, ({ card }) =>
			this.thoughts[card.order].possibilities.reduce((sum, p) => sum += distance(p, crit_percents[0].percent === 1), 0));

		return furthest_card;
	}

	/**
	 * Returns the orders of cards of which this player is unsure about their identities (i.e. at least one is bad touched).
	 * @param {State} state
	 */
	linkedOrders(state) {
		const unknownLinks = this.links.filter(({ cards, identities }) =>
			cards.length > identities.reduce((sum, identity) => sum += unknownIdentities(state, this, identity), 0));

		return new Set(unknownLinks.flatMap(link => link.cards.map(c => c.order)));
	}

	get hypo_score() {
		return this.hypo_stacks.reduce((sum, stack) => sum + stack) + this.unknown_plays.size;
	}

	/**
	 * @param {State} state
	 * Computes the hypo stacks and unknown plays.
	 */
	update_hypo_stacks(state) {
		// Reset hypo stacks to play stacks
		const hypo_stacks = state.play_stacks.slice();
		const unknown_plays = new Set();

		let found_new_playable = true;
		const good_touch_elim = /** @type {Identity[]}*/ ([]);

		const linked_orders = this.linkedOrders(state);

		/**
		 * Checks if all possibilities have been either eliminated by good touch or are playable (but not all eliminated).
		 * @param {BasicCard[]} poss
		 */
		const delayed_playable = (poss) => {
			const remaining_poss = poss.filter(c => !good_touch_elim.some(e => c.matches(e)));
			return remaining_poss.length > 0 && remaining_poss.every(c => hypo_stacks[c.suitIndex] + 1 === c.rank);
		};

		// Attempt to play all playable cards
		while (found_new_playable) {
			found_new_playable = false;

			for (const { order } of state.hands.flat()) {
				const card = this.thoughts[order];

				if (!card.saved || good_touch_elim.some(e => card.matches(e)) || linked_orders.has(order))
					continue;

				const fake_wcs = this.waiting_connections.filter(wc => {
					const { fake, focused_card, inference } = wc;
					return focused_card.order === order && (fake || !state.deck[focused_card.order].matches(inference, { assume: true }));
				});

				// Ignore all waiting connections that will be proven wrong
				const diff = card.clone();
				diff.inferred = diff.inferred.subtract(fake_wcs.flatMap(wc => wc.inference));

				if (diff.matches_inferences() &&
					(delayed_playable(diff.possible.array) || delayed_playable(diff.inferred.array) || (diff.finessed && delayed_playable([card])))
				) {
					const id = card.identity({ infer: true });
					const actual_id = state.deck[order].identity();

					// Do not allow false updating of hypo stacks
					if (this.playerIndex === -1 && (
						(id && actual_id && !id.matches(actual_id)) ||		// Identity doesn't match
						(actual_id && state.hands.flat().some(c => unknown_plays.has(c.order) && c.matches(actual_id)))	||	// Duping playable
						(this.waiting_connections.some(wc =>				// Only part of a fake ambiguous connection
							!state.deck[wc.focused_card.order].matches(wc.inference, { assume: true }) &&
							wc.connections.some((conn, index) => index >= wc.conn_index && conn.card.order === order))
						&&
							!this.waiting_connections.some(wc =>
								state.deck[wc.focused_card.order].matches(wc.inference, { assume: true }) &&
								wc.connections.some((conn, index) => index >= wc.conn_index && conn.card.order === order)))
					))
						continue;

					if (id === undefined) {
						// Playable, but the player doesn't know what card it is so hypo stacks aren't updated
						unknown_plays.add(order);

						const promised_link = this.links.find(link => link.promised && link.cards.some(c => c.order === order));

						// All cards in a promised link will be played
						if (promised_link?.cards.every(c => unknown_plays.has(c.order))) {
							const { suitIndex, rank } = promised_link.identities[0];

							if (rank !== hypo_stacks[suitIndex] + 1) {
								logger.warn(`tried to add ${logCard(promised_link.identities[0])} onto hypo stacks, but they were at ${hypo_stacks[suitIndex]}??`);
							}
							else {
								hypo_stacks[suitIndex] = rank;
								good_touch_elim.push(promised_link.identities[0]);
								found_new_playable = true;
							}
						}
						continue;
					}

					const { suitIndex, rank } = id;

					if (rank !== hypo_stacks[suitIndex] + 1) {
						// e.g. a duplicated 1 before any 1s have played will have all bad possibilities eliminated by good touch
						logger.warn(`tried to add new playable card ${logCard(card)} ${card.order}, hypo stacks at ${hypo_stacks[suitIndex]}`);
						continue;
					}

					hypo_stacks[suitIndex] = rank;
					good_touch_elim.push(id);
					found_new_playable = true;
				}
			}
		}
		this.hypo_stacks = hypo_stacks;
		this.unknown_plays = unknown_plays;
	}
}
