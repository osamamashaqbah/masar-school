export function finalQuizScore(score, selected, correct) {
  return score + (selected === correct ? 1 : 0)
}
