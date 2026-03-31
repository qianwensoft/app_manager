package com.appmanager.agent.ui
import com.appmanager.agent.R

import android.os.Build
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.appmanager.agent.util.AppVersions
import com.appmanager.agent.util.DeviceInfoUtil

class DeviceInfoFragment : Fragment() {

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_device_info, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        view.findViewById<TextView>(R.id.tvAgentAppVersion).text =
            "Agent 版本: ${AppVersions.displayLabel(requireContext())}"

        view.findViewById<TextView>(R.id.tvModel).text = "型号: ${Build.MODEL}"
        view.findViewById<TextView>(R.id.tvBrand).text = "品牌: ${Build.BRAND}"
        view.findViewById<TextView>(R.id.tvAndroidVersion).text = "Android: ${Build.VERSION.RELEASE}"
        view.findViewById<TextView>(R.id.tvSdk).text = "SDK: ${Build.VERSION.SDK_INT}"
        view.findViewById<TextView>(R.id.tvSerial).text = "序列号: ${Build.SERIAL}"

        val memInfo = DeviceInfoUtil.getMemoryInfo(requireContext())
        view.findViewById<TextView>(R.id.tvMemory).text = "内存: ${memInfo.used}MB / ${memInfo.total}MB"

        val storageInfo = DeviceInfoUtil.getStorageInfo()
        view.findViewById<TextView>(R.id.tvStorage).text =
            "存储: ${storageInfo.usedMB}MB / ${storageInfo.totalMB}MB"

        val cpuInfo = DeviceInfoUtil.getCpuInfo()
        view.findViewById<TextView>(R.id.tvCpu).text = "CPU: $cpuInfo"

        val battery = DeviceInfoUtil.getBatteryLevel(requireContext())
        view.findViewById<TextView>(R.id.tvBattery).text = "电量: $battery%"
    }
}
