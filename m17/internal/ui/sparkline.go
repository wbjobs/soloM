package ui

import (
	"fmt"
	"math"
	"strings"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"
)

type Sparkline struct {
	*tview.Box
	data        []float64
	maxDataLen  int
	color       tcell.Color
	title       string
	showLegend  bool
	unit        string
	lastWidth   int
	lastHeight  int
}

func (s *Sparkline) clearArea(screen tcell.Screen, x, y, width, height int) {
	style := tcell.StyleDefault.Background(tcell.ColorDefault)
	for row := 0; row < height; row++ {
		for col := 0; col < width; col++ {
			screen.SetContent(x+col, y+row, ' ', nil, style)
		}
	}
}

var sparklineChars = []rune{' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'}

func NewSparkline() *Sparkline {
	s := &Sparkline{
		Box:        tview.NewBox(),
		maxDataLen: 100,
		color:      tcell.ColorGreen,
		showLegend: true,
		unit:       "%",
	}
	s.Box.SetBorder(true)
	return s
}

func (s *Sparkline) SetTitle(title string) *Sparkline {
	s.title = title
	s.Box.SetTitle(title)
	return s
}

func (s *Sparkline) SetColor(color tcell.Color) *Sparkline {
	s.color = color
	return s
}

func (s *Sparkline) SetData(data []float64) *Sparkline {
	if len(data) > s.maxDataLen {
		data = data[len(data)-s.maxDataLen:]
	}
	s.data = data
	return s
}

func (s *Sparkline) SetMaxDataLen(length int) *Sparkline {
	s.maxDataLen = length
	return s
}

func (s *Sparkline) SetShowLegend(show bool) *Sparkline {
	s.showLegend = show
	return s
}

func (s *Sparkline) SetUnit(unit string) *Sparkline {
	s.unit = unit
	return s
}

func (s *Sparkline) Draw(screen tcell.Screen) {
	s.Box.Draw(screen)

	x, y, width, height := s.GetInnerRect()
	if width <= 0 || height <= 0 {
		s.lastWidth = 0
		s.lastHeight = 0
		return
	}

	s.clearArea(screen, x, y, width, height)

	if s.lastWidth != width || s.lastHeight != height {
		s.lastWidth = width
		s.lastHeight = height
	}

	legendHeight := 0
	if s.showLegend {
		legendHeight = 1
	}

	graphHeight := height - legendHeight
	if graphHeight <= 0 {
		return
	}

	if len(s.data) == 0 {
		return
	}

	maxVal := 0.0
	minVal := 0.0
	for _, v := range s.data {
		if v > maxVal {
			maxVal = v
		}
		if v < minVal {
			minVal = v
		}
	}

	if maxVal == minVal {
		maxVal = minVal + 1
	}

	var stepX float64
	if len(s.data) > width {
		stepX = float64(len(s.data)) / float64(width)
	} else {
		stepX = 1.0
	}

	style := tcell.StyleDefault.Foreground(s.color)

	dataLen := len(s.data)
	for i := 0; i < width; i++ {
		var idx int
		if dataLen > width {
			idx = int(float64(i) * stepX)
		} else {
			startX := (width - dataLen) / 2
			if i < startX || i >= startX+dataLen {
				continue
			}
			idx = i - startX
		}

		if idx >= dataLen {
			idx = dataLen - 1
		}
		if idx < 0 {
			idx = 0
		}

		value := s.data[idx]
		normalized := (value - minVal) / (maxVal - minVal)
		if normalized < 0 {
			normalized = 0
		}
		if normalized > 1 {
			normalized = 1
		}

		barHeight := int(math.Round(normalized * float64(graphHeight*8)))

		fullBars := barHeight / 8
		remainder := barHeight % 8

		if fullBars > graphHeight {
			fullBars = graphHeight
			remainder = 0
		}

		for j := 0; j < fullBars; j++ {
			px := x + i
			py := y + graphHeight - 1 - j
			if px >= x && px < x+width && py >= y && py < y+height {
				screen.SetContent(px, py, '█', nil, style)
			}
		}

		if remainder > 0 && fullBars < graphHeight {
			px := x + i
			py := y + graphHeight - 1 - fullBars
			if px >= x && px < x+width && py >= y && py < y+height {
				screen.SetContent(px, py, sparklineChars[remainder], nil, style)
			}
		}
	}

	if s.showLegend && len(s.data) > 0 {
		current := s.data[len(s.data)-1]
		legend := fmt.Sprintf(" 当前: %.1f%s | 最大: %.1f%s | 最小: %.1f%s ",
			current, s.unit, maxVal, s.unit, minVal, s.unit)

		legendX := x + (width-len(legend))/2
		if legendX < x {
			legendX = x
		}

		legendY := y + graphHeight
		if legendY >= y && legendY < y+height {
			for i, ch := range legend {
				px := legendX + i
				if px >= x && px < x+width {
					screen.SetContent(px, legendY, ch, nil, tcell.StyleDefault.Foreground(tcell.ColorWhite))
				}
			}
		}
	}
}

type MultiSparkline struct {
	*tview.Box
	lines       []*SparklineLine
	maxDataLen  int
	showLegend  bool
	lastWidth   int
	lastHeight  int
}

func (m *MultiSparkline) clearArea(screen tcell.Screen, x, y, width, height int) {
	style := tcell.StyleDefault.Background(tcell.ColorDefault)
	for row := 0; row < height; row++ {
		for col := 0; col < width; col++ {
			screen.SetContent(x+col, y+row, ' ', nil, style)
		}
	}
}

type SparklineLine struct {
	Data  []float64
	Color tcell.Color
	Label string
	Unit  string
}

func NewMultiSparkline() *MultiSparkline {
	m := &MultiSparkline{
		Box:        tview.NewBox(),
		maxDataLen: 100,
		showLegend: true,
	}
	m.Box.SetBorder(true)
	return m
}

func (m *MultiSparkline) SetTitle(title string) *MultiSparkline {
	m.Box.SetTitle(title)
	return m
}

func (m *MultiSparkline) SetLines(lines []*SparklineLine) *MultiSparkline {
	m.lines = lines
	for _, line := range m.lines {
		if len(line.Data) > m.maxDataLen {
			line.Data = line.Data[len(line.Data)-m.maxDataLen:]
		}
	}
	return m
}

func (m *MultiSparkline) SetMaxDataLen(length int) *MultiSparkline {
	m.maxDataLen = length
	return m
}

func (m *MultiSparkline) SetShowLegend(show bool) *MultiSparkline {
	m.showLegend = show
	return m
}

func (m *MultiSparkline) Draw(screen tcell.Screen) {
	m.Box.Draw(screen)

	x, y, width, height := m.GetInnerRect()
	if width <= 0 || height <= 0 || len(m.lines) == 0 {
		m.lastWidth = 0
		m.lastHeight = 0
		return
	}

	m.clearArea(screen, x, y, width, height)

	if m.lastWidth != width || m.lastHeight != height {
		m.lastWidth = width
		m.lastHeight = height
	}

	linesCount := len(m.lines)
	legendHeight := 0
	if m.showLegend {
		legendHeight = 1
	}

	graphHeight := height - legendHeight
	if graphHeight <= 0 {
		return
	}

	lineHeight := graphHeight / linesCount
	if lineHeight < 2 {
		lineHeight = 2
	}

	for lineIdx, line := range m.lines {
		if len(line.Data) == 0 {
			continue
		}

		lineY := y + lineIdx*lineHeight
		lineH := lineHeight - 1

		if lineH < 1 {
			lineH = 1
		}

		maxVal := 0.0
		minVal := 0.0
		for _, v := range line.Data {
			if v > maxVal {
				maxVal = v
			}
			if v < minVal {
				minVal = v
			}
		}

		if maxVal == minVal {
			maxVal = minVal + 1
		}

		var stepX float64
		dataLen := len(line.Data)
		if dataLen > width {
			stepX = float64(dataLen) / float64(width)
		} else {
			stepX = 1.0
		}

		style := tcell.StyleDefault.Foreground(line.Color)

		for i := 0; i < width; i++ {
			var idx int
			if dataLen > width {
				idx = int(float64(i) * stepX)
			} else {
				startX := (width - dataLen) / 2
				if i < startX || i >= startX+dataLen {
					continue
				}
				idx = i - startX
			}

			if idx >= dataLen {
				idx = dataLen - 1
			}
			if idx < 0 {
				idx = 0
			}

			value := line.Data[idx]
			normalized := (value - minVal) / (maxVal - minVal)
			if normalized < 0 {
				normalized = 0
			}
			if normalized > 1 {
				normalized = 1
			}

			barHeight := int(math.Round(normalized * float64(lineH*8)))

			fullBars := barHeight / 8
			remainder := barHeight % 8

			if fullBars > lineH {
				fullBars = lineH
				remainder = 0
			}

			for j := 0; j < fullBars; j++ {
				px := x + i
				py := lineY + lineH - 1 - j
				if px >= x && px < x+width && py >= y && py < y+height {
					screen.SetContent(px, py, '█', nil, style)
				}
			}

			if remainder > 0 && fullBars < lineH {
				px := x + i
				py := lineY + lineH - 1 - fullBars
				if px >= x && px < x+width && py >= y && py < y+height {
					screen.SetContent(px, py, sparklineChars[remainder], nil, style)
				}
			}
		}

		if line.Label != "" {
			label := line.Label
			labelY := lineY + lineH
			if labelY >= y && labelY < y+height {
				for i, ch := range label {
					px := x + i
					if px >= x && px < x+width {
						screen.SetContent(px, labelY, ch, nil, tcell.StyleDefault.Foreground(line.Color))
					}
				}
			}
		}
	}

	if m.showLegend {
		var parts []string
		for _, line := range m.lines {
			if len(line.Data) > 0 {
				current := line.Data[len(line.Data)-1]
				parts = append(parts, fmt.Sprintf("%s: %.1f%s", line.Label, current, line.Unit))
			}
		}
		legend := " " + strings.Join(parts, " | ") + " "

		legendX := x + (width-len(legend))/2
		if legendX < x {
			legendX = x
		}

		legendY := y + graphHeight
		if legendY >= y && legendY < y+height {
			for i, ch := range legend {
				px := legendX + i
				if px >= x && px < x+width {
					screen.SetContent(px, legendY, ch, nil, tcell.StyleDefault.Foreground(tcell.ColorWhite))
				}
			}
		}
	}
}
