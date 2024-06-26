import { isTrash } from '../../basics/hanabi-util.js';
import { team_elim, undo_hypo_stacks } from '../../basics/helper.js';
import { interpret_sarcastic } from '../shared/sarcastic.js';
import * as Basics from '../../basics.js';

import logger from '../../tools/logger.js';
import { logCard } from '../../tools/log.js';

/**
 * @typedef {import('../h-group.js').default} Game
 * @typedef {import('../h-player.js').HGroup_Player} Player
 * @typedef {import('../../basics/Hand.js').Hand} Hand
 * @typedef {import('../../basics/Card.js').ActualCard} ActualCard
 * @typedef {import('../../types.js').Identity} Identity
 */

/**
 * Interprets (writes notes) for a discard of the given card.
 * @param {Game} game
 * @param {import('../../types.js').DiscardAction} action
 * @param {ActualCard} card
 */
export function interpret_discard(game, action, card) {
	const { common, state, me } = game;
	const { order, playerIndex, suitIndex, rank,  failed } = action;
	const identity = { suitIndex, rank };
	const thoughts = common.thoughts[order];

	Basics.onDiscard(game, action);

	const to_remove = [];
	for (let i = 0; i < common.waiting_connections.length; i++) {
		const { connections, conn_index, inference, action_index } = common.waiting_connections[i];

		const dc_conn_index = connections.findIndex((conn, index) => index >= conn_index && conn.card.order === order);
		if (dc_conn_index !== -1) {
			const { card } = connections[dc_conn_index];
			logger.info(`discarded connecting card ${logCard(card)}, cancelling waiting connection for inference ${logCard(inference)}`);

			to_remove.push(i);

			// No other waiting connections exist for this
			if (!common.waiting_connections.some((wc, index) => action_index === wc.action_index && !to_remove.includes(index))) {
				// Check if sarcastic
				if (card.clued && rank > state.play_stacks[suitIndex] && rank <= state.max_ranks[suitIndex] && !failed) {
					const sarcastics = interpret_sarcastic(game, action);

					// Sarcastic, rewrite connection onto this person
					if (sarcastics.length === 1) {
						logger.info('rewriting connection to use sarcastic on order', sarcastics[0].order);
						Object.assign(connections[dc_conn_index], {
							reacting: state.hands.findIndex(hand => hand.findOrder(sarcastics[0].order)),
							card: sarcastics[0]
						});
						return;
					}
				}

				const real_connects = connections.filter((conn, index) => index < dc_conn_index && !conn.hidden).length;
				game.rewind(action_index, { type: 'ignore', conn_index: real_connects, order });
				return;
			}
		}
	}

	if (to_remove.length > 0)
		common.waiting_connections = common.waiting_connections.filter((_, index) => !to_remove.includes(index));

	// End early game?
	if (state.early_game && !action.failed && !card.clued) {
		logger.warn('ending early game from discard of', logCard(card));
		state.early_game = false;
	}

	// If bombed or the card doesn't match any of our inferences (and is not trash), rewind to the reasoning and adjust
	if (!thoughts.rewinded && (failed || (!thoughts.matches_inferences() && !isTrash(state, me, card, card.order)))) {
		logger.info('all inferences', thoughts.inferred.map(logCard));

		const action_index = card.drawn_index;
		game.rewind(action_index, { type: 'identify', order, playerIndex, suitIndex, rank }, thoughts.finessed);
		return;
	}

	// Discarding a useful card
	// Note: we aren't including chop moved and finessed cards here since those can be asymmetric.
	// Discarding with a finesse will trigger the waiting connection to resolve.
	if (card.clued && rank > state.play_stacks[suitIndex] && rank <= state.max_ranks[suitIndex]) {
		logger.warn('discarded useful card!');
		common.restore_elim(card);

		// Card was bombed
		if (failed)
			undo_hypo_stacks(game, identity);
		else
			interpret_sarcastic(game, action);
	}
	team_elim(game);
}
