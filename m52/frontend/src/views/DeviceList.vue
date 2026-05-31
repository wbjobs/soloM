<template>
  <div class="device-list">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>设备管理</span>
          <el-button type="primary" @click="showAddDialog">
            <el-icon><Plus /></el-icon>
            添加设备
          </el-button>
        </div>
      </template>

      <el-table :data="devices" style="width: 100%" v-loading="loading">
        <el-table-column prop="name" label="设备名称" />
        <el-table-column prop="type" label="设备类型" />
        <el-table-column prop="description" label="描述" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">
              {{ row.status === 'active' ? '活跃' : '离线' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250">
          <template #default="{ row }">
            <el-button type="primary" link @click="goToDetail(row.id)">
              查看数据
            </el-button>
            <el-button type="success" link @click="showEditDialog(row)">
              编辑
            </el-button>
            <el-button type="danger" link @click="deleteDevice(row.id)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑设备' : '添加设备'"
      width="500px"
    >
      <el-form
        ref="formRef"
        :model="formData"
        label-width="80px"
      >
        <el-form-item label="设备名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入设备名称" />
        </el-form-item>
        <el-form-item label="设备类型" prop="type">
          <el-select v-model="formData.type" placeholder="请选择设备类型" style="width: 100%">
            <el-option label="温度传感器" value="temperature" />
            <el-option label="湿度传感器" value="humidity" />
            <el-option label="温湿度传感器" value="temp-humidity" />
            <el-option label="压力传感器" value="pressure" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="3"
            placeholder="请输入设备描述"
          />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-switch
            v-model="formData.status"
            active-text="活跃"
            inactive-text="离线"
            active-value="active"
            inactive-value="inactive"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveDevice">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { deviceApi } from '../api'

const router = useRouter()
const devices = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const formData = reactive({
  id: '',
  name: '',
  type: '',
  description: '',
  status: 'active'
})

const loadDevices = async () => {
  loading.value = true
  try {
    const res = await deviceApi.list()
    devices.value = res.data
  } catch (error) {
    ElMessage.error('加载设备列表失败')
  } finally {
    loading.value = false
  }
}

const showAddDialog = () => {
  isEdit.value = false
  formData.id = ''
  formData.name = ''
  formData.type = ''
  formData.description = ''
  formData.status = 'active'
  dialogVisible.value = true
}

const showEditDialog = (row) => {
  isEdit.value = true
  formData.id = row.id
  formData.name = row.name
  formData.type = row.type
  formData.description = row.description
  formData.status = row.status
  dialogVisible.value = true
}

const saveDevice = async () => {
  try {
    if (isEdit.value) {
      await deviceApi.update(formData.id, formData)
      ElMessage.success('设备更新成功')
    } else {
      await deviceApi.create(formData)
      ElMessage.success('设备创建成功')
    }
    dialogVisible.value = false
    loadDevices()
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const deleteDevice = async (id) => {
  try {
    await ElMessageBox.confirm(
      '确定要删除该设备吗？',
      '提示',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    await deviceApi.delete(id)
    ElMessage.success('删除成功')
    loadDevices()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

const goToDetail = (id) => {
  router.push(`/device/${id}`)
}

const formatDate = (date) => {
  if (!date) return ''
  return new Date(date).toLocaleString('zh-CN')
}

onMounted(() => {
  loadDevices()
})
</script>

<style scoped>
.device-list {
  width: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
