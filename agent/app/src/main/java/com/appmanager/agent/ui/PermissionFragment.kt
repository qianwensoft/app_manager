package com.appmanager.agent.ui
import com.appmanager.agent.R

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

class PermissionFragment : Fragment() {

    private val permissions = listOf(
        PermissionItem("相机", Manifest.permission.CAMERA),
        PermissionItem("位置", Manifest.permission.ACCESS_FINE_LOCATION),
        PermissionItem("存储", Manifest.permission.WRITE_EXTERNAL_STORAGE),
        PermissionItem("录音", Manifest.permission.RECORD_AUDIO),
        PermissionItem("通讯录", Manifest.permission.READ_CONTACTS),
        PermissionItem("电话", Manifest.permission.READ_PHONE_STATE),
        PermissionItem("短信", Manifest.permission.READ_SMS)
    )

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_permission, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val recyclerView = view.findViewById<RecyclerView>(R.id.recyclerView)
        recyclerView.layoutManager = LinearLayoutManager(requireContext())

        val adapter = PermissionAdapter(permissions) { permission, grant ->
            if (grant) {
                ActivityCompat.requestPermissions(requireActivity(), arrayOf(permission.permission), 100)
            } else {
                Toast.makeText(requireContext(), "请在系统设置中撤销权限", Toast.LENGTH_SHORT).show()
            }
        }
        recyclerView.adapter = adapter
    }
}

data class PermissionItem(val name: String, val permission: String)

class PermissionAdapter(
    private val permissions: List<PermissionItem>,
    private val onToggle: (PermissionItem, Boolean) -> Unit
) : RecyclerView.Adapter<PermissionAdapter.ViewHolder>() {

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val tvName: TextView = view.findViewById(R.id.tvPermissionName)
        val switchPermission: Switch = view.findViewById(R.id.switchPermission)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_permission, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = permissions[position]
        holder.tvName.text = item.name

        val granted = ContextCompat.checkSelfPermission(
            holder.itemView.context, item.permission
        ) == PackageManager.PERMISSION_GRANTED

        holder.switchPermission.isChecked = granted
        holder.switchPermission.setOnCheckedChangeListener { _, isChecked ->
            if (isChecked != granted) {
                onToggle(item, isChecked)
            }
        }
    }

    override fun getItemCount() = permissions.size
}
