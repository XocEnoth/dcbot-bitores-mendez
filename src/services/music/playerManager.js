import MusicPlayer from './musicPlayer.js';

const players = new Map();

/**
 * Retrieves an active MusicPlayer instance for the given guild ID.
 *
 * @param {string} guildId - The Discord guild ID.
 * @returns {MusicPlayer|undefined} The music player instance.
 */
const getPlayer = (guildId) => players.get(guildId);

/**
 * Gets an existing MusicPlayer instance or creates a new one for the guild.
 *
 * @param {string} guildId - The Discord guild ID.
 * @returns {MusicPlayer} The music player instance.
 */
const getOrCreatePlayer = (guildId) => {
  let player = players.get(guildId);

  if (!player) {
    player = new MusicPlayer(guildId);
    player.onDestroy = (id) => players.delete(id);
    players.set(guildId, player);
  }

  return player;
};

/**
 * Destroys the MusicPlayer instance for the given guild ID.
 *
 * @param {string} guildId - The Discord guild ID.
 */
const destroyPlayer = (guildId) => {
  const player = players.get(guildId);
  if (player) {
    player.destroy();
    players.delete(guildId);
  }
};

export default { getPlayer, getOrCreatePlayer, destroyPlayer };
