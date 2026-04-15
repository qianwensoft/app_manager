package com.appmanager.agent.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.appmanager.agent.R

data class CatalogRow(
    val title: String,
    val subtitle: String,
    val onClickDetail: (() -> Unit)? = null,
    /** 出站连接器：长按弹出菜单（暂停 / 启用 / 排除）。 */
    val outboundMenu: (() -> Unit)? = null
)

class CatalogListAdapter(
    private var rows: List<CatalogRow> = emptyList()
) : RecyclerView.Adapter<CatalogListAdapter.VH>() {

    class VH(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val title: TextView = itemView.findViewById(R.id.tvTitle)
        val subtitle: TextView = itemView.findViewById(R.id.tvSubtitle)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_agent_catalog_row, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val r = rows[position]
        holder.title.text = r.title
        holder.subtitle.text = r.subtitle
        holder.itemView.setOnClickListener {
            r.onClickDetail?.invoke()
        }
        holder.itemView.setOnLongClickListener {
            val menu = r.outboundMenu
            if (menu != null) {
                menu.invoke()
                true
            } else {
                false
            }
        }
    }

    override fun getItemCount(): Int = rows.size

    fun submit(newRows: List<CatalogRow>) {
        rows = newRows
        notifyDataSetChanged()
    }
}
