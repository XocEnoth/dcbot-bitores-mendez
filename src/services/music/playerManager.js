import MusicPlayer from './musicPlayer.js';

const players = new Map();

const getPlayer = (guildId) => players.get(guildId);

const getOrCreatePlayer = (guildId) => {
  let player = players.get(guildId);

  if (!player) {
    player = new MusicPlayer(guildId);
    player.onDestroy = (id) => players.delete(id);
    players.set(guildId, player);
  }

  return player;
};

const destroyPlayer = (guildId) => {
  const player = players.get(guildId);
  if (player) {
    player.destroy();
    players.delete(guildId);
  }
};

export default { getPlayer, getOrCreatePlayer, destroyPlayer };
