package game

const (
	BoardSize = 15
	Empty     = 0
	Black     = 1
	White     = 2
)

type Game struct {
	Board      [][]int `json:"board"`
	CurrentTurn int    `json:"currentTurn"`
	History    []Move  `json:"history"`
	GameOver   bool    `json:"gameOver"`
	Winner     int     `json:"winner"`
}

type Move struct {
	X     int `json:"x"`
	Y     int `json:"y"`
	Color int `json:"color"`
}

func NewGame() *Game {
	board := make([][]int, BoardSize)
	for i := range board {
		board[i] = make([]int, BoardSize)
	}
	return &Game{
		Board:       board,
		CurrentTurn: Black,
		History:     []Move{},
		GameOver:    false,
		Winner:      0,
	}
}

func (g *Game) MakeMove(x, y int, color int) bool {
	if g.GameOver || g.Board[x][y] != Empty || g.CurrentTurn != color {
		return false
	}

	g.Board[x][y] = color
	g.History = append(g.History, Move{X: x, Y: y, Color: color})

	if g.CheckWin(x, y, color) {
		g.GameOver = true
		g.Winner = color
	} else {
		g.CurrentTurn = 3 - color
	}

	return true
}

func (g *Game) UndoMove() bool {
	if len(g.History) == 0 {
		return false
	}

	lastMove := g.History[len(g.History)-1]
	g.Board[lastMove.X][lastMove.Y] = Empty
	g.History = g.History[:len(g.History)-1]
	g.GameOver = false
	g.Winner = 0
	g.CurrentTurn = lastMove.Color

	return true
}

func (g *Game) GetBoardState() [][]int {
	return g.Board
}

func (g *Game) CheckWin(x, y, color int) bool {
	directions := [][]int{
		{1, 0},
		{0, 1},
		{1, 1},
		{1, -1},
	}

	for _, dir := range directions {
		count := 1

		for i := 1; i < 5; i++ {
			nx, ny := x+dir[0]*i, y+dir[1]*i
			if nx < 0 || nx >= BoardSize || ny < 0 || ny >= BoardSize || g.Board[nx][ny] != color {
				break
			}
			count++
		}

		for i := 1; i < 5; i++ {
			nx, ny := x-dir[0]*i, y-dir[1]*i
			if nx < 0 || nx >= BoardSize || ny < 0 || ny >= BoardSize || g.Board[nx][ny] != color {
				break
			}
			count++
		}

		if count >= 5 {
			return true
		}
	}

	return false
}

func (g *Game) Reset() {
	for i := range g.Board {
		for j := range g.Board[i] {
			g.Board[i][j] = Empty
		}
	}
	g.CurrentTurn = Black
	g.History = []Move{}
	g.GameOver = false
	g.Winner = 0
}
