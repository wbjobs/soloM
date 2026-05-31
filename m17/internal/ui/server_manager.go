package ui

import (
	"fmt"
	"strconv"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"
	"server-monitor/internal/remote"
)

type ServerManagerPanel struct {
	*tview.Grid
	serverList    *tview.Table
	addForm       *tview.Form
	manager       *remote.ServerManager
	app           *tview.Application
	onServerAdded func()
	onServerRemoved func()
}

func NewServerManagerPanel(manager *remote.ServerManager, app *tview.Application) *ServerManagerPanel {
	p := &ServerManagerPanel{
		Grid:    tview.NewGrid(),
		manager: manager,
		app:     app,
	}

	p.serverList = tview.NewTable().SetBorders(false)
	p.serverList.SetBorder(true).SetTitle(" 服务器列表 ")
	p.serverList.SetSelectable(true, false)

	headers := []string{"ID", "名称", "主机", "端口", "用户", "状态"}
	headerStyle := tcell.StyleDefault.Foreground(tcell.ColorYellow).Bold(true)
	for i, header := range headers {
		p.serverList.SetCell(0, i, tview.NewTableCell(header).SetStyle(headerStyle).SetSelectable(false))
	}

	p.addForm = tview.NewForm()
	p.addForm.SetBorder(true).SetTitle(" 添加服务器 ")

	p.addForm.AddInputField("名称", "", 30, nil, nil)
	p.addForm.AddInputField("主机地址", "", 30, nil, nil)
	p.addForm.AddInputField("端口", "22", 10, func(text string, ch rune) bool {
		_, err := strconv.Atoi(text)
		return text == "" || err == nil
	}, nil)
	p.addForm.AddInputField("用户名", "", 30, nil, nil)
	p.addForm.AddPasswordField("密码", "", 30, '*', nil)
	p.addForm.AddInputField("密钥文件路径", "", 50, nil, nil)
	p.addForm.AddPasswordField("密钥密码", "", 30, '*', nil)

	p.addForm.AddButton("添加", p.addServer)
	p.addForm.AddButton("删除选中", p.removeSelectedServer)
	p.addForm.AddButton("测试连接", p.testConnection)
	p.addForm.AddButton("重置", p.resetForm)

	p.SetRows(-1).
		SetColumns(-2, -1).
		AddItem(p.serverList, 0, 0, 1, 1, 0, 0, true).
		AddItem(p.addForm, 0, 1, 1, 1, 0, 0, false)

	p.RefreshServerList()

	return p
}

func (p *ServerManagerPanel) SetOnServerAdded(f func()) {
	p.onServerAdded = f
}

func (p *ServerManagerPanel) SetOnServerRemoved(f func()) {
	p.onServerRemoved = f
}

func (p *ServerManagerPanel) RefreshServerList() {
	servers := p.manager.GetServers()

	for i := 1; i < 50; i++ {
		for j := 0; j < 6; j++ {
			p.serverList.SetCell(i, j, tview.NewTableCell(""))
		}
	}

	row := 1
	for _, id := range servers {
		node, exists := p.manager.GetNode(id)
		if !exists {
			continue
		}

		status := "[green]在线[-]"
		if !node.IsConnected() {
			if id == "local" {
				status = "[green]本地[-]"
			} else {
				status = "[red]离线[-]"
			}
		}

		name := node.Config.Name
		if id == "local" {
			name = fmt.Sprintf("%s (本地)", name)
		}

		portStr := strconv.Itoa(node.Config.Port)
		if node.Config.Port == 0 {
			portStr = "-"
		}

		p.serverList.SetCell(row, 0, tview.NewTableCell(id))
		p.serverList.SetCell(row, 1, tview.NewTableCell(name))
		p.serverList.SetCell(row, 2, tview.NewTableCell(node.Config.Host))
		p.serverList.SetCell(row, 3, tview.NewTableCell(portStr))
		p.serverList.SetCell(row, 4, tview.NewTableCell(node.Config.User))
		p.serverList.SetCell(row, 5, tview.NewTableCell(status))
		row++
	}
}

func (p *ServerManagerPanel) addServer() {
	name := p.addForm.GetFormItem(0).(*tview.InputField).GetText()
	host := p.addForm.GetFormItem(1).(*tview.InputField).GetText()
	portStr := p.addForm.GetFormItem(2).(*tview.InputField).GetText()
	user := p.addForm.GetFormItem(3).(*tview.InputField).GetText()
	password := p.addForm.GetFormItem(4).(*tview.InputField).GetText()
	keyFile := p.addForm.GetFormItem(5).(*tview.InputField).GetText()
	passphrase := p.addForm.GetFormItem(6).(*tview.InputField).GetText()

	if name == "" || host == "" || user == "" {
		p.showError("请填写名称、主机地址和用户名")
		return
	}

	port, err := strconv.Atoi(portStr)
	if err != nil || port <= 0 || port > 65535 {
		p.showError("端口必须是1-65535之间的数字")
		return
	}

	if password == "" && keyFile == "" {
		p.showError("请提供密码或密钥文件路径")
		return
	}

	config := &remote.ServerConfig{
		Name:       name,
		Host:       host,
		Port:       port,
		User:       user,
		Password:   password,
		KeyFile:    keyFile,
		Passphrase: passphrase,
	}

	if err := p.manager.AddServer(config); err != nil {
		p.showError(fmt.Sprintf("添加服务器失败: %v", err))
		return
	}

	if err := p.manager.SaveConfig(); err != nil {
		p.showError(fmt.Sprintf("保存配置失败: %v", err))
	}

	p.RefreshServerList()
	p.resetForm()
	p.showSuccess("服务器添加成功")

	if p.onServerAdded != nil {
		p.onServerAdded()
	}
}

func (p *ServerManagerPanel) removeSelectedServer() {
	row, _ := p.serverList.GetSelection()
	if row <= 0 {
		p.showError("请先选择一个服务器")
		return
	}

	idCell := p.serverList.GetCell(row, 0)
	if idCell == nil {
		return
	}

	id := idCell.Text
	if id == "local" {
		p.showError("不能删除本地主机")
		return
	}

	confirmModal := tview.NewModal().
		SetText(fmt.Sprintf("确定要删除服务器 %s 吗?", id)).
		AddButtons([]string{"确定", "取消"}).
		SetDoneFunc(func(buttonIndex int, buttonLabel string) {
			if buttonLabel == "确定" {
				if err := p.manager.RemoveServer(id); err != nil {
					p.showError(fmt.Sprintf("删除失败: %v", err))
					return
				}

				if err := p.manager.SaveConfig(); err != nil {
					p.showError(fmt.Sprintf("保存配置失败: %v", err))
				}

				p.RefreshServerList()
				p.showSuccess("服务器删除成功")

				if p.onServerRemoved != nil {
					p.onServerRemoved()
				}
			}
		})

	p.appModal(confirmModal)
}

func (p *ServerManagerPanel) testConnection() {
	row, _ := p.serverList.GetSelection()
	if row <= 0 {
		p.showError("请先选择一个服务器")
		return
	}

	idCell := p.serverList.GetCell(row, 0)
	if idCell == nil {
		return
	}

	id := idCell.Text
	if id == "local" {
		p.showSuccess("本地主机无需测试连接")
		return
	}

	node, exists := p.manager.GetNode(id)
	if !exists {
		p.showError("服务器不存在")
		return
	}

	if node.Client == nil {
		p.showError("服务器客户端未初始化")
		return
	}

	p.showSuccess("正在测试连接...")
	go func() {
		if err := node.Client.Connect(); err != nil {
			p.showError(fmt.Sprintf("连接失败: %v", err))
			return
		}
		defer node.Client.Disconnect()
		p.showSuccess("连接成功!")
	}()
}

func (p *ServerManagerPanel) resetForm() {
	p.addForm.GetFormItem(0).(*tview.InputField).SetText("")
	p.addForm.GetFormItem(1).(*tview.InputField).SetText("")
	p.addForm.GetFormItem(2).(*tview.InputField).SetText("22")
	p.addForm.GetFormItem(3).(*tview.InputField).SetText("")
	p.addForm.GetFormItem(4).(*tview.InputField).SetText("")
	p.addForm.GetFormItem(5).(*tview.InputField).SetText("")
	p.addForm.GetFormItem(6).(*tview.InputField).SetText("")
}

func (p *ServerManagerPanel) showError(msg string) {
	p.showMessage(msg, tcell.ColorRed)
}

func (p *ServerManagerPanel) showSuccess(msg string) {
	p.showMessage(msg, tcell.ColorGreen)
}

func (p *ServerManagerPanel) showMessage(msg string, color tcell.Color) {
	modal := tview.NewModal().
		SetText(msg).
		AddButtons([]string{"确定"}).
		SetTextColor(color)

	p.appModal(modal)
}

func (p *ServerManagerPanel) appModal(modal *tview.Modal) {
	if p.app == nil {
		return
	}

	root := p.app.GetRoot()
	pages, ok := root.(*tview.Pages)
	if !ok {
		pages = tview.NewPages()
		pages.AddPage("main", root, true, true)
		p.app.SetRoot(pages, true)
	}

	modal.SetDoneFunc(func(buttonIndex int, buttonLabel string) {
		pages.RemovePage("modal")
	})

	pages.AddPage("modal", modal, true, true)
	p.app.Draw()
}
