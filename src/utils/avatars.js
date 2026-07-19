export const AVATAR_OPTIONS = [
  { id: 'lion', emoji: '🦁', bg: 'linear-gradient(135deg,#F5A623,#E8873A)' },
  { id: 'tiger', emoji: '🐯', bg: 'linear-gradient(135deg,#F0955C,#C15B4A)' },
  { id: 'bear', emoji: '🐻', bg: 'linear-gradient(135deg,#A6754A,#7A5230)' },
  { id: 'panda', emoji: '🐼', bg: 'linear-gradient(135deg,#6B7280,#374151)' },
  { id: 'fox', emoji: '🦊', bg: 'linear-gradient(135deg,#E8873A,#A85A1D)' },
  { id: 'koala', emoji: '🐨', bg: 'linear-gradient(135deg,#8B978C,#5B6B60)' },
  { id: 'frog', emoji: '🐸', bg: 'linear-gradient(135deg,#5CB280,#2F8F5B)' },
  { id: 'owl', emoji: '🦉', bg: 'linear-gradient(135deg,#9C6E2A,#5B3E17)' },
  { id: 'turtle', emoji: '🐢', bg: 'linear-gradient(135deg,#3E7CA6,#1B5D80)' },
  { id: 'unicorn', emoji: '🦄', bg: 'linear-gradient(135deg,#DA82AC,#8A3D63)' },
  { id: 'dolphin', emoji: '🐬', bg: 'linear-gradient(135deg,#5CB0DE,#1B5D80)' },
  { id: 'butterfly', emoji: '🦋', bg: 'linear-gradient(135deg,#9C82E8,#5638A8)' },
  { id: 'star', emoji: '⭐', bg: 'linear-gradient(135deg,#F0C64A,#C99A1E)' },
  { id: 'rocket', emoji: '🚀', bg: 'linear-gradient(135deg,#6C8CFF,#3E5FCC)' },
  { id: 'art', emoji: '🎨', bg: 'linear-gradient(135deg,#C15B8F,#8A3D63)' },
  { id: 'books', emoji: '📚', bg: 'linear-gradient(135deg,#2F8F5B,#1E6A40)' },
]

export function getAvatar(avatarId) {
  return AVATAR_OPTIONS.find((a) => a.id === avatarId) || null
}
