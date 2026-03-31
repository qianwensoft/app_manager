package com.appmanager.agent.ui
import com.appmanager.agent.R

import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentActivity
import androidx.viewpager2.adapter.FragmentStateAdapter

class DeviceInfoPagerAdapter(activity: FragmentActivity) : FragmentStateAdapter(activity) {

    override fun getItemCount(): Int = 3

    override fun createFragment(position: Int): Fragment {
        return when (position) {
            0 -> DeviceInfoFragment()
            1 -> AppListFragment()
            2 -> PermissionFragment()
            else -> DeviceInfoFragment()
        }
    }
}
