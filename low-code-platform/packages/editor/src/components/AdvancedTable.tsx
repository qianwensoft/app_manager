import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    flexRender,
    ColumnDef,
    ColumnResizeMode,
    VisibilityState,
    RowData,
} from '@tanstack/react-table';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, Settings, Filter, Plus, Trash2, Check, X as XIcon, ChevronUp, ChevronDown, Download, ArrowUpDown, ArrowUp, ArrowDown, Hash, Type, Pin, PinOff } from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import './advanced-table.css';

// 扩展 @tanstack/react-table 的 ColumnMeta 类型
declare module '@tanstack/react-table' {
    interface ColumnMeta<TData extends RowData, TValue> {
        editable?: boolean;  // 列级别的编辑开关，默认 true
        draggable?: boolean;  // 列是否可拖拽，默认 true
        fixed?: 'left' | 'right';  // 列固定位置：left-固定在左侧，right-固定在右侧
        customCell?: boolean;  // 是否使用自定义 cell 渲染（优先使用 cell 而不是 EditableCell）
        exportable?: boolean;  // 列是否可导出，默认 true（设置为 false 则导出 Excel 时跳过该列）
    }
}

// 过滤操作符类型
export type FilterOperator = 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual' | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'isEmpty' | 'isNotEmpty';

// 排序类型
export type SortType = 'alpha' | 'numeric';  // alpha: 字母排序, numeric: 数字排序

// 排序方向
export type SortDirection = 'asc' | 'desc' | null;  // asc: 升序, desc: 降序, null: 不排序

// 排序配置
export interface SortConfig {
    type: SortType;
    direction: SortDirection;
}

// 列的排序配置集合
export interface ColumnSorts {
    [columnId: string]: SortConfig;
}

// 过滤条件接口
export interface FilterCondition {
    id: string;
    operator: FilterOperator;
    value?: string | number; // 空/非空操作符不需要值
}

// 列的过滤条件集合
export interface ColumnFilters {
    [columnId: string]: FilterCondition[];
}

// 过滤回调函数类型（用于接口调用）
// _T 保留用于类型一致性（前缀 _ 表示有意未使用）
export type OnFilterChange<_T = any> = (columnId: string, filters: FilterCondition[], allFilters: ColumnFilters) => void | Promise<void>;

// 操作符选项
const operatorOptions: { value: FilterOperator; label: string }[] = [
    { value: 'equals', label: '等于' },
    { value: 'notEquals', label: '不等于' },
    { value: 'greaterThan', label: '大于' },
    { value: 'lessThan', label: '小于' },
    { value: 'greaterThanOrEqual', label: '大于等于' },
    { value: 'lessThanOrEqual', label: '小于等于' },
    { value: 'contains', label: '包含' },
    { value: 'notContains', label: '不包含' },
    { value: 'startsWith', label: '开头是' },
    { value: 'endsWith', label: '结尾是' },
    { value: 'isEmpty', label: '为空' },
    { value: 'isNotEmpty', label: '非空' },
];

// 判断操作符是否需要值输入
const operatorRequiresValue = (operator: FilterOperator): boolean => {
    return operator !== 'isEmpty' && operator !== 'isNotEmpty';
};

// 可自动扩展的输入框组件
interface AutoExpandInputProps {
    value: string | number;
    onChange: (value: string) => void;
    placeholder?: string;
    type?: string;
    minWidth?: number;
    maxWidth?: number;
    className?: string;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
    inputRef?: React.RefObject<HTMLInputElement | null>;
    autoFocus?: boolean;
    useCellWidth?: boolean;  // 是否使用单元格宽度（100%）
}

const AutoExpandInput: React.FC<AutoExpandInputProps> = ({
                                                             value,
                                                             onChange,
                                                             placeholder,
                                                             type = 'text',
                                                             minWidth = 80,
                                                             maxWidth = 300,
                                                             className = '',
                                                             onKeyDown,
                                                             onBlur,
                                                             inputRef: externalInputRef,
                                                             autoFocus = false,
                                                             useCellWidth = false,
                                                         }) => {
    const internalInputRef = useRef<HTMLInputElement>(null);
    const inputRef = externalInputRef || internalInputRef;
    const measureRef = useRef<HTMLSpanElement>(null);
    const [width, setWidth] = useState(maxWidth);  // 初始宽度使用最大宽度

    // 根据内容计算宽度（仅在非单元格宽度模式下）
    React.useEffect(() => {
        if (!useCellWidth && measureRef.current) {
            const text = String(value ?? '');
            const placeholderText = placeholder ?? '';
            const displayText = text || placeholderText;

            measureRef.current.textContent = displayText || 'M'; // 至少一个字符来测量
            const measuredWidth = measureRef.current.offsetWidth;
            // 如果内容宽度小于最大宽度，则使用内容宽度；否则使用最大宽度
            const newWidth = Math.max(minWidth, Math.min(maxWidth, measuredWidth + 20)); // 加上padding
            setWidth(newWidth);
        }
    }, [value, placeholder, minWidth, maxWidth, useCellWidth]);

    // 自动聚焦
    React.useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [autoFocus, inputRef]);

    return (
        <div className="auto-expand-input-wrapper" style={{ position: 'relative',
            display: useCellWidth ? 'block' : 'inline-block', width: useCellWidth ? '100%' : 'auto' }}>
            {!useCellWidth && (
                <span
                    ref={measureRef}
                    style={{
                        position: 'absolute',
                        visibility: 'hidden',
                        whiteSpace: 'pre',
                        fontSize: '13px',
                        padding: '6px 8px',
                        fontFamily: 'inherit',
                    }}
                />
            )}
            <input
                ref={inputRef}
                type={type}
                className={`auto-expand-input ${className}`}
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                onBlur={onBlur}
                placeholder={placeholder}
                style={{
                    width: useCellWidth ? '100%' : `${width}px`,
                    minWidth: useCellWidth ? '0' : `${minWidth}px`,
                    maxWidth: useCellWidth ? 'none' : `${maxWidth}px`,
                }}
            />
        </div>
    );
};

// 过滤条件面板组件
interface FilterPanelProps {
    columnId: string;
    columnHeader: string;
    filters: FilterCondition[];
    onFiltersChange: (filters: FilterCondition[]) => void;
    sortConfig?: SortConfig;  // 当前列的排序配置
    onSortChange?: (config: SortConfig) => void;  // 排序配置变更回调
    onClose: () => void;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
                                                     columnHeader,
                                                     filters,
                                                     onFiltersChange,
                                                     sortConfig,
                                                     onSortChange,
                                                     onClose,
                                                 }) => {
    // 本地状态：存储临时的过滤条件（未确认前不触发刷新）
    const [localFilters, setLocalFilters] = React.useState<FilterCondition[]>(filters);

    // 当外部 filters 变化时，更新本地状态
    React.useEffect(() => {
        setLocalFilters(filters);
    }, [filters]);

    // 添加过滤条件
    const handleAddCondition = () => {
        const newCondition: FilterCondition = {
            id: `filter-${Date.now()}-${Math.random()}`,
            operator: 'equals',
            value: '',
        };
        setLocalFilters([...localFilters, newCondition]);
    };

    // 删除过滤条件
    const handleRemoveCondition = (id: string) => {
        setLocalFilters(localFilters.filter((f) => f.id !== id));
    };

    // 更新过滤条件
    const handleUpdateCondition = (id: string, updates: Partial<FilterCondition>) => {
        setLocalFilters(
            localFilters.map((f) => (f.id === id ? { ...f, ...updates } : f))
        );
    };

    // 清除所有过滤条件
    const handleClearAll = () => {
        setLocalFilters([]);
    };

    // 确认应用过滤条件
    const handleConfirm = () => {
        onFiltersChange(localFilters);
        onClose(); // 关闭弹窗
    };

    // 取消修改，恢复到外部传入的 filters
    const handleCancel = () => {
        setLocalFilters(filters);
        onClose(); // 关闭弹窗
    };

    // 处理排序类型变更
    const handleSortTypeChange = (type: SortType) => {
        if (onSortChange) {
            onSortChange({
                type,
                direction: sortConfig?.direction || 'asc',
            });
        }
    };

    // 处理排序方向变更
    const handleSortDirectionChange = () => {
        if (onSortChange && sortConfig) {
            let newDirection: SortDirection;
            if (sortConfig.direction === null) {
                newDirection = 'asc';
            } else if (sortConfig.direction === 'asc') {
                newDirection = 'desc';
            } else {
                newDirection = null;
            }
            onSortChange({
                ...sortConfig,
                direction: newDirection,
            });
        }
    };

    // 清除排序
    const handleClearSort = () => {
        if (onSortChange) {
            onSortChange({
                type: 'alpha',
                direction: null,
            });
        }
    };

    return (
        <div className="filter-panel-content">
            <div className="filter-panel-header">
                <span className="filter-panel-title">{columnHeader}</span>
            </div>
            <div className="filter-panel-body">
                {/* 排序区域 - 移到最上面 */}
                {onSortChange && (
                    <div className="filter-sort-section">
                        <div className="filter-sort-controls">
                            <Button
                                variant="ghost"
                                size="sm"
                                className={`filter-sort-type-button ${sortConfig?.type === 'alpha' ? 'sort-active' : ''}`}
                                onClick={() => handleSortTypeChange('alpha')}
                                title="字母排序 (A-Z)"
                            >
                                <Type size={10} />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className={`filter-sort-type-button ${sortConfig?.type === 'numeric' ? 'sort-active' : ''}`}
                                onClick={() => handleSortTypeChange('numeric')}
                                title="数字排序 (强制转为数字)"
                            >
                                <Hash size={10} />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className={`filter-sort-direction-button ${sortConfig?.direction ? 'sort-active' : ''}`}
                                onClick={handleSortDirectionChange}
                                title={
                                    sortConfig?.direction === null
                                        ? '点击启用排序'
                                        : sortConfig?.direction === 'asc'
                                            ? '升序 (点击切换为降序)'
                                            : '降序 (点击取消排序)'
                                }
                            >
                                {sortConfig?.direction === null && <ArrowUpDown size={10} />}
                                {sortConfig?.direction === 'asc' && <ArrowUp size={10} />}
                                {sortConfig?.direction === 'desc' && <ArrowDown size={10} />}
                            </Button>
                            {sortConfig?.direction && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="filter-sort-clear-button"
                                    onClick={handleClearSort}
                                    title="清除排序"
                                >
                                    <X size={10} />
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {localFilters.length === 0 ? (
                    <div className="filter-empty-state">
                        <p>暂无过滤条件</p>
                        <Button variant="default" size="sm" className="filter-add-button" onClick={handleAddCondition}>
                            <Plus size={14} />
                            添加条件
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="filter-conditions">
                            {localFilters.map((condition, index) => (
                                <div key={condition.id} className="filter-condition-item">
                                    {index > 0 && <div className="filter-connector">且</div>}
                                    <div className="filter-condition-content">
                                        <select
                                            className="filter-operator-select"
                                            value={condition.operator}
                                            onChange={(e) =>
                                                handleUpdateCondition(condition.id, {
                                                    operator: e.target.value as FilterOperator,
                                                })
                                            }
                                        >
                                            {operatorOptions.map((opt) => (
                                                <option key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </option>
                                            ))}
                                        </select>
                                        {operatorRequiresValue(condition.operator) ? (
                                            <AutoExpandInput
                                                value={condition.value ?? ''}
                                                onChange={(value) =>
                                                    handleUpdateCondition(condition.id, { value })
                                                }
                                                placeholder="输入值"
                                                minWidth={80}
                                                maxWidth={250}
                                                className="filter-value-input"
                                            />
                                        ) : (
                                            <div className="filter-value-placeholder">
                                                {condition.operator === 'isEmpty' ? '为空' : '非空'}
                                            </div>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="filter-remove-button"
                                            onClick={() => handleRemoveCondition(condition.id)}
                                            title="删除条件"
                                        >
                                            <Trash2 size={14} />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="filter-panel-actions">
                            <Button variant="default" size="sm" className="filter-add-condition-button" onClick={handleAddCondition}>
                                <Plus size={14} />
                                添加条件
                            </Button>
                            <Button variant="outline" size="sm" className="filter-clear-button" onClick={handleClearAll}>
                                清除全部
                            </Button>
                        </div>
                    </>
                )}

                {/* 确认和取消按钮 */}
                <div className="filter-panel-footer">
                    <Button variant="outline" size="sm" className="filter-cancel-button" onClick={handleCancel}>
                        取消
                    </Button>
                    <Button variant="default" size="sm" className="filter-confirm-button" onClick={handleConfirm}>
                        确认
                    </Button>
                </div>
            </div>
        </div>
    );
};

// 可拖拽的列头组件
interface DraggableColumnHeaderProps {
    column: any;
    children: React.ReactNode;
    hasFilters: boolean;
    isFilterOpen: boolean;
    onFilterOpenChange: (open: boolean) => void;
    filterPanelContent?: React.ReactNode;
    showFilter?: boolean;  // 是否显示过滤按钮
    showDragHandle?: boolean;  // 是否显示拖拽手柄
    onHeaderClick?: (columnIndex: number) => void;  // 表头点击回调
    columnIndex?: number;  // 列索引
    isColumnSelected?: boolean;  // 列是否被选中
    fixedPosition?: number;  // 固定列的位置（left/right 的累积宽度）
}

const DraggableColumnHeader: React.FC<DraggableColumnHeaderProps> = ({
                                                                         column,
                                                                         children,
                                                                         hasFilters,
                                                                         isFilterOpen,
                                                                         onFilterOpenChange,
                                                                         filterPanelContent,
                                                                         showFilter = true,
                                                                         showDragHandle = true,
                                                                         onHeaderClick,
                                                                         columnIndex = 0,
                                                                         isColumnSelected = false,
                                                                         fixedPosition,
                                                                     }) => {
    const fixedType = column.columnDef.meta?.fixed;

    // 检查列是否允许拖拽（默认为 true）
    const isDraggable = column.columnDef.meta?.draggable !== false;

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: column.id,
        disabled: !isDraggable,  // 如果不允许拖拽，禁用 sortable
    });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        width: column.getSize(),
        minWidth: column.columnDef.minSize,
        maxWidth: column.columnDef.maxSize,
        ...(fixedType === 'left' && fixedPosition !== undefined ? { left: fixedPosition } : {}),
        ...(fixedType === 'right' && fixedPosition !== undefined ? { right: fixedPosition } : {}),
    };

    const handleHeaderClick = (e: React.MouseEvent) => {
        // 忽略按钮点击
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.resize-handle')) {
            return;
        }
        onHeaderClick?.(columnIndex);
    };

    const headerClassName = `table-header-cell ${isColumnSelected ? 'column-selected' : ''} ${fixedType === 'left' ? 'fixed-left' : ''} ${fixedType === 'right' ? 'fixed-right' : ''}`;

    return (
        <th
            ref={setNodeRef}
            style={style}
            className={headerClassName}
            colSpan={column.columnDef.meta?.colSpan}
            onClick={handleHeaderClick}
        >
            <div className="header-content">
                {showDragHandle && isDraggable && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="drag-handle"
                        {...attributes}
                        {...listeners}
                        title="拖拽排序"
                    >
                        <GripVertical size={16} />
                    </Button>
                )}
                <div className="header-title" style={{ flex: 1, minWidth: 0 }}>
                    {children}
                </div>
                {showFilter && (
                    <Popover open={isFilterOpen} onOpenChange={onFilterOpenChange}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={`filter-button ${hasFilters ? 'filter-active' : ''}`}
                                title="过滤"
                                style={{ position: 'relative', zIndex: 1, flexShrink: 0 }}
                            >
                                <Filter size={14} />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            className="filter-popover-content"
                            align="start"
                            side="bottom"
                            sideOffset={4}
                        >
                            {filterPanelContent}
                        </PopoverContent>
                    </Popover>
                )}
                <div
                    className="resize-handle"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        const startX = e.pageX;
                        const startWidth = column.getSize();
                        const columnId = column.id;

                        // 获取表头元素
                        const headerElement = (e.target as HTMLElement).closest('th') as HTMLTableHeaderCellElement;

                        // 获取该列的所有单元格（包括表头）
                        const columnIndex = Array.from(headerElement.parentElement?.children || []).indexOf(headerElement);
                        const tableElement = headerElement.closest('table');
                        const allCellsInColumn: HTMLElement[] = [];

                        if (tableElement && columnIndex >= 0) {
                            // 获取所有行的对应列单元格
                            const rows = tableElement.querySelectorAll('tr');
                            rows.forEach(row => {
                                const cell = row.children[columnIndex] as HTMLElement;
                                if (cell) {
                                    allCellsInColumn.push(cell);
                                }
                            });
                        }

                        const handleMouseMove = (moveEvent: MouseEvent) => {
                            const diff = moveEvent.pageX - startX;
                            const newWidth = Math.max(50, Math.min(500, startWidth + diff));

                            // 实时更新该列所有单元格宽度（视觉反馈）
                            allCellsInColumn.forEach(cell => {
                                cell.style.width = `${newWidth}px`;
                                cell.style.minWidth = `${newWidth}px`;
                                cell.style.maxWidth = `${newWidth}px`;
                            });
                        };

                        const handleMouseUp = (moveEvent: MouseEvent) => {
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);

                            // 计算最终宽度
                            const diff = moveEvent.pageX - startX;
                            const newWidth = Math.max(50, Math.min(500, startWidth + diff));

                            // 更新状态（持久化）
                            const resizeEvent = new CustomEvent('columnResize', {
                                detail: { columnId, size: newWidth }
                            });
                            document.dispatchEvent(resizeEvent);
                        };

                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                    }}
                />
            </div>
        </th>
    );
};

// 可拖拽的列设置项组件
interface SortableColumnItemProps {
    column: any;
    columnVisibility: VisibilityState;
    columnOrder: string[];
    index: number;
    onToggleColumn: (columnId: string) => void;
    onMoveUp: (columnId: string) => void;
    onMoveDown: (columnId: string) => void;
    enableReorder?: boolean;  // 是否启用排序功能
    columnFixed?: 'left' | 'right' | null;  // 列固定位置
    onFixedChange?: (columnId: string, fixed: 'left' | 'right' | null) => void;  // 列固定变更回调
}

const SortableColumnItem: React.FC<SortableColumnItemProps> = ({
                                                                   column,
                                                                   columnVisibility,
                                                                   columnOrder,
                                                                   index,
                                                                   onToggleColumn,
                                                                   onMoveUp,
                                                                   onMoveDown,
                                                                   enableReorder = false,
                                                                   columnFixed,
                                                                   onFixedChange,
                                                               }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: column.id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const isFirst = index === 0;
    const isLast = index === columnOrder.length - 1;

    // 处理列固定切换
    const handleFixedToggle = () => {
        if (!onFixedChange) return;

        // 循环切换：无固定 -> 固定左侧 -> 固定右侧 -> 无固定
        let newFixed: 'left' | 'right' | null = null;
        if (columnFixed === null || columnFixed === undefined) {
            newFixed = 'left';
        } else if (columnFixed === 'left') {
            newFixed = 'right';
        } else {
            newFixed = null;
        }

        onFixedChange(column.id, newFixed);
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`column-settings-item ${isDragging ? 'dragging' : ''}`}
        >
            {enableReorder && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="column-drag-handle"
                    {...attributes}
                    {...listeners}
                    title="拖拽排序"
                >
                    <GripVertical size={16} />
                </Button>
            )}
            <label className="column-checkbox">
                <input
                    type="checkbox"
                    checked={columnVisibility[column.id] !== false}
                    onChange={() => onToggleColumn(column.id)}
                />
                <span>{column.columnDef.header as string}</span>
            </label>
            {onFixedChange && (
                <Button
                    variant="ghost"
                    size="icon"
                    className={`column-fixed-button ${columnFixed ? 'fixed-active' : ''}`}
                    onClick={handleFixedToggle}
                    title={
                        columnFixed === 'left'
                            ? '固定在左侧 (点击切换到右侧)'
                            : columnFixed === 'right'
                                ? '固定在右侧 (点击取消固定)'
                                : '点击固定列'
                    }
                >
                    {columnFixed === 'left' && <Pin size={14} style={{ transform: 'rotate(-45deg)' }} />}
                    {columnFixed === 'right' && <Pin size={14} style={{ transform: 'rotate(45deg)' }} />}
                    {!columnFixed && <PinOff size={14} />}
                </Button>
            )}
            {enableReorder && (
                <div className="column-order-controls">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="column-move-button"
                        onClick={() => onMoveUp(column.id)}
                        disabled={isFirst}
                        title="上移"
                    >
                        <ChevronUp size={16} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="column-move-button"
                        onClick={() => onMoveDown(column.id)}
                        disabled={isLast}
                        title="下移"
                    >
                        <ChevronDown size={16} />
                    </Button>
                </div>
            )}
        </div>
    );
};

// 列设置弹窗组件
interface ColumnVisibilityModalProps {
    columns: any[];
    columnVisibility: VisibilityState;
    columnOrder: string[];
    onToggleColumn: (columnId: string) => void;
    onColumnOrderChange: (newOrder: string[]) => void;
    onClose: () => void;
    enableReorder?: boolean;  // 是否启用排序功能，默认 false
    columnFixed?: Record<string, 'left' | 'right' | null>;  // 列固定配置
    onFixedChange?: (columnId: string, fixed: 'left' | 'right' | null) => void;  // 列固定变更回调
}

const ColumnVisibilityModal: React.FC<ColumnVisibilityModalProps> = ({
                                                                         columns,
                                                                         columnVisibility,
                                                                         columnOrder,
                                                                         onToggleColumn,
                                                                         onColumnOrderChange,
                                                                         onClose,
                                                                         enableReorder = false,
                                                                         columnFixed = {},
                                                                         onFixedChange,
                                                                     }) => {
    console.log('=== ColumnVisibilityModal 渲染 ===');
    console.log('columns:', columns);
    console.log('columnOrder:', columnOrder);
    console.log('orderedColumns 数量:', columns.length);

    // 使用 state 来延迟打开 Dialog，避免立即触发 onOpenChange(false)
    const [isOpen, setIsOpen] = React.useState(false);

    // 拖拽位置状态
    const [position, setPosition] = React.useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = React.useState(false);
    const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });

    // 检查 DOM 中是否有 Dialog
    React.useEffect(() => {
        console.log('ColumnVisibilityModal mounted');
        // 使用 setTimeout 确保在下一个 tick 打开 Dialog
        const timer = setTimeout(() => {
            setIsOpen(true);
            console.log('Dialog isOpen 设置为 true');

            // 再次检查 DOM
            setTimeout(() => {
                const dialogElements = document.querySelectorAll('[role="dialog"]');
                const overlays = document.querySelectorAll('[data-state]');
                const portals = document.querySelectorAll('[data-radix-portal]');
                console.log('=== DOM 检查（isOpen=true 后）===');
                console.log('dialog 元素数量:', dialogElements.length);
                console.log('overlay 元素数量:', overlays.length);
                console.log('portal 元素数量:', portals.length);

                if (dialogElements.length > 0) {
                    dialogElements.forEach((el, i) => {
                        const styles = window.getComputedStyle(el);
                        console.log(`Dialog ${i} className:`, el.className);
                        console.log(`Dialog ${i} 样式:`, {
                            display: styles.display,
                            visibility: styles.visibility,
                            opacity: styles.opacity,
                            zIndex: styles.zIndex,
                            position: styles.position,
                            left: styles.left,
                            top: styles.top,
                            transform: styles.transform,
                        });
                        console.log(`Dialog ${i} 完整元素:`, el);
                    });
                }

                // 检查 body 下的所有子元素
                console.log('Body 的直接子元素:', Array.from(document.body.children).map(el => ({
                    tag: el.tagName,
                    id: el.id,
                    className: el.className,
                })));
            }, 100);
        }, 0);

        return () => {
            clearTimeout(timer);
            console.log('ColumnVisibilityModal unmounted');
        };
    }, []);

    // 拖拽处理
    const handleMouseDown = (e: React.MouseEvent) => {
        // 只允许在标题栏拖拽
        if ((e.target as HTMLElement).closest('[data-dialog-title]')) {
            setIsDragging(true);
            setDragStart({
                x: e.clientX - position.x,
                y: e.clientY - position.y,
            });
        }
    };

    React.useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            setPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y,
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStart]);

    // 隐藏 shadcn-ui 默认关闭按钮
    React.useEffect(() => {
        if (!isOpen) return;

        // 延迟一点确保 DOM 已渲染
        const timer = setTimeout(() => {
            // 查找并隐藏 DialogContent 内的 DialogPrimitive.Close 按钮
            const dialogContent = document.querySelector('[role="dialog"]');
            if (dialogContent) {
                const defaultCloseButton = dialogContent.querySelector('button[class*="absolute"]');
                if (defaultCloseButton && defaultCloseButton instanceof HTMLElement) {
                    defaultCloseButton.style.display = 'none';
                }
            }
        }, 50);

        return () => clearTimeout(timer);
    }, [isOpen]);

    // 根据 columnOrder 排序列
    const orderedColumns = useMemo(() => {
        const columnMap = new Map(columns.map((col) => [col.id, col]));
        const result = columnOrder
            .map((id) => columnMap.get(id))
            .filter(Boolean) as any[];
        console.log('orderedColumns 计算结果:', result);
        return result;
    }, [columns, columnOrder]);

    // 拖拽传感器
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // 处理拖拽结束
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = columnOrder.indexOf(active.id as string);
            const newIndex = columnOrder.indexOf(over.id as string);
            const newOrder = arrayMove(columnOrder, oldIndex, newIndex);
            onColumnOrderChange(newOrder);
        }
    };

    // 上移列
    const handleMoveUp = (columnId: string) => {
        const index = columnOrder.indexOf(columnId);
        if (index > 0) {
            const newOrder = arrayMove(columnOrder, index, index - 1);
            onColumnOrderChange(newOrder);
        }
    };

    // 下移列
    const handleMoveDown = (columnId: string) => {
        const index = columnOrder.indexOf(columnId);
        if (index < columnOrder.length - 1) {
            const newOrder = arrayMove(columnOrder, index, index + 1);
            onColumnOrderChange(newOrder);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            console.log('Dialog onOpenChange 被调用:', open);
            if (!open) {
                setIsOpen(false);
                onClose();
            }
        }}>
            <DialogContent
                className="sm:max-w-[500px]"
                onMouseDown={handleMouseDown}
                style={{
                    position: 'fixed',
                    left: position.x === 0 ? '50%' : `${position.x}px`,
                    top: position.y === 0 ? '50%' : `${position.y}px`,
                    transform: position.x === 0 && position.y === 0 ? 'translate(-50%, -50%)' : 'none',
                    zIndex: 50,
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '0',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
                    maxWidth: '500px',
                    width: '100%',
                    maxHeight: '85vh',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: isDragging ? 'move' : 'default',
                }}
            >
                {/* 标题栏 */}
                <div
                    data-dialog-title
                    style={{
                        padding: '24px 24px 16px 24px',
                        cursor: 'move',
                        userSelect: 'none',
                        borderBottom: '1px solid #e5e7eb',
                        position: 'relative',
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>列设置</DialogTitle>
                        <DialogDescription>
                            管理表格列的显示、顺序和固定位置
                        </DialogDescription>
                    </DialogHeader>
                    {/* 自定义关闭按钮 */}
                    <button
                        onClick={() => {
                            setIsOpen(false);
                            onClose();
                        }}
                        style={{
                            position: 'absolute',
                            right: '16px',
                            top: '16px',
                            width: '24px',
                            height: '24px',
                            borderRadius: '4px',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: 0.7,
                            transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                        aria-label="关闭"
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path
                                d="M12 4L4 12M4 4L12 12"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                            />
                        </svg>
                    </button>
                </div>
                {/* 内容区域 */}
                <div style={{ padding: '16px 24px 24px 24px', overflowY: 'auto', flex: 1 }}>
                    {enableReorder && (
                        <div className="column-settings-hint">
                            <p>拖拽左侧图标或使用上下箭头调整列顺序</p>
                        </div>
                    )}
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext items={columnOrder} strategy={verticalListSortingStrategy}>
                            {orderedColumns.map((column, index) => (
                                <SortableColumnItem
                                    key={column.id}
                                    column={column}
                                    columnVisibility={columnVisibility}
                                    columnOrder={columnOrder}
                                    index={index}
                                    onToggleColumn={onToggleColumn}
                                    onMoveUp={handleMoveUp}
                                    onMoveDown={handleMoveDown}
                                    enableReorder={enableReorder}
                                    columnFixed={columnFixed[column.id] || null}
                                    onFixedChange={onFixedChange}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                </div>
            </DialogContent>
        </Dialog>
    );
};

// 可编辑单元格组件
interface EditableCellProps {
    value: any;
    rowIndex: number;
    columnId: string;
    isEditing: boolean;
    onStartEdit: () => void;
    onSave: (value: any) => void;
    onCancel: () => void;
    onPendingChange?: (rowIndex: number, columnId: string, value: any) => void;  // 未保存的临时修改
    columnType?: 'text' | 'number' | 'email' | 'date';
    autoSave?: boolean;  // 是否自动保存（不显示确认/取消按钮）
    editTriggerMode?: EditTriggerMode;  // 编辑触发模式
}

const EditableCell: React.FC<EditableCellProps> = ({
                                                       value,
                                                       rowIndex,
                                                       columnId,
                                                       isEditing,
                                                       onStartEdit,
                                                       onSave,
                                                       onCancel,
                                                       onPendingChange,
                                                       columnType = 'text',
                                                       autoSave = false,
                                                       editTriggerMode = 'doubleClick',
                                                   }) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [editValue, setEditValue] = useState<string>(String(value ?? ''));

    // 当进入编辑模式时，聚焦输入框
    React.useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    // 当值变化时更新编辑值
    React.useEffect(() => {
        setEditValue(String(value ?? ''));
    }, [value]);

    const isSavingRef = useRef(false);

    const handleSave = () => {
        if (isSavingRef.current) return;
        isSavingRef.current = true;

        let finalValue: any = editValue;

        // 根据类型转换值
        if (columnType === 'number') {
            finalValue = editValue === '' ? null : Number(editValue);
            if (isNaN(finalValue)) {
                // 如果转换失败，恢复原值
                setEditValue(String(value ?? ''));
                isSavingRef.current = false;
                return;
            }
        }

        // 检查值是否真的改变了（避免不必要的更新）
        const currentValue = value;
        if (autoSave && finalValue === currentValue) {
            // 值没改变，直接取消编辑
            isSavingRef.current = false;
            onCancel();
            return;
        }

        onSave(finalValue);
        setTimeout(() => {
            isSavingRef.current = false;
        }, 100);
    };

    const handleCancel = () => {
        setEditValue(String(value ?? ''));
        onCancel();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            if (autoSave) {
                // autoSave 模式下，Esc 直接取消编辑
                handleCancel();
            } else {
                handleCancel();
            }
        }
    };

    const handleBlur = (e: React.FocusEvent) => {
        if (autoSave) {
            // autoSave 模式下，失去焦点时直接保存
            // 使用 requestAnimationFrame 确保在下一帧执行，避免闪动
            if (!isSavingRef.current) {
                requestAnimationFrame(() => {
                    handleSave();
                });
            }
            return;
        }

        // autoSave=false 模式下，失焦不保存，只退出编辑状态
        // 如果焦点移动到保存/取消按钮，不处理（让按钮处理）
        const relatedTarget = e.relatedTarget as HTMLElement;
        if (relatedTarget && (
            relatedTarget.classList.contains('editable-cell-save') ||
            relatedTarget.classList.contains('editable-cell-cancel')
        )) {
            return;
        }

        // 失焦时：如果值有变化，保存为待保存状态；否则直接退出编辑
        let finalValue: any = editValue;

        // 根据类型转换值
        if (columnType === 'number') {
            finalValue = editValue === '' ? null : Number(editValue);
            if (isNaN(finalValue)) {
                // 如果转换失败，恢复原值并退出编辑
                setEditValue(String(value ?? ''));
                onCancel();
                return;
            }
        }

        // 检查值是否真的改变了
        if (finalValue !== value) {
            // 值改变了，保存为待保存状态
            if (onPendingChange) {
                onPendingChange(rowIndex, columnId, finalValue);
            }
        }

        // 退出编辑状态
        onCancel();
    };

    if (isEditing) {
        return (
            <div className="editable-cell-wrapper">
                <AutoExpandInput
                    value={editValue}
                    onChange={setEditValue}
                    type={columnType === 'number' ? 'number' : columnType === 'email' ? 'email' : columnType === 'date' ? 'date' : 'text'}
                    minWidth={60}
                    maxWidth={400}
                    className="editable-cell-input"
                    inputRef={inputRef}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    autoFocus={isEditing}
                    useCellWidth={true}
                />
                {!autoSave && (
                    <div className="editable-cell-actions">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="editable-cell-save"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleSave();
                            }}
                            onMouseDown={(e) => e.preventDefault()}
                            title="保存 (Enter)"
                        >
                            <Check size={14} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="editable-cell-cancel"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleCancel();
                            }}
                            onMouseDown={(e) => e.preventDefault()}
                            title="取消 (Esc)"
                        >
                            <XIcon size={14} />
                        </Button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            className="editable-cell-display"
            onClick={editTriggerMode === 'click' ? onStartEdit : undefined}
            onDoubleClick={editTriggerMode === 'doubleClick' ? onStartEdit : undefined}
            title={editTriggerMode === 'click' ? "单击编辑" : "双击编辑"}
        >
            {value !== null && value !== undefined ? String(value) : ''}
        </div>
    );
};

// 导出选项类型
export type ExportScope = 'current' | 'all' | 'filtered';

export interface ExportOptions {
    filename?: string;
    scope?: ExportScope;
    sheetName?: string;
}

// 分页模式
export type PaginationMode = 'client' | 'server';  // client: 前端分页, server: 后端分页

// 分页配置接口
export interface PaginationConfig {
    pageIndex: number;      // 当前页码（从0开始）
    pageSize: number;       // 每页条数
    totalCount: number;     // 总条数
    mode?: PaginationMode;  // 分页模式，默认 'client'
}

// 分页回调接口
export interface PaginationCallbacks {
    onPageChange?: (pageIndex: number) => void;
    onPageSizeChange?: (pageSize: number) => void;
}

// 分页组件 Props
interface PaginationProps {
    pageIndex: number;
    pageSize: number;
    totalCount: number;
    onPageChange: (pageIndex: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    pageSizeOptions?: number[];
}

// 分页组件
const Pagination: React.FC<PaginationProps> = ({
                                                   pageIndex,
                                                   pageSize,
                                                   totalCount,
                                                   onPageChange,
                                                   onPageSizeChange,
                                                   pageSizeOptions = [10, 20, 50, 100],
                                               }) => {
    const totalPages = Math.ceil(totalCount / pageSize);
    const startItem = pageIndex * pageSize + 1;
    const endItem = Math.min((pageIndex + 1) * pageSize, totalCount);

    // 生成页码数组
    const getPageNumbers = () => {
        const pages: (number | string)[] = [];
        const showPages = 5; // 显示的页码数量

        if (totalPages <= showPages + 2) {
            // 总页数较少，全部显示
            for (let i = 0; i < totalPages; i++) {
                pages.push(i);
            }
        } else {
            // 总页数较多，显示省略号
            pages.push(0); // 第一页

            let start = Math.max(1, pageIndex - Math.floor(showPages / 2));
            let end = Math.min(totalPages - 2, pageIndex + Math.floor(showPages / 2));

            // 调整范围
            if (start <= 1) {
                end = Math.min(showPages, totalPages - 2);
                start = 1;
            }
            if (end >= totalPages - 2) {
                start = Math.max(1, totalPages - showPages - 1);
                end = totalPages - 2;
            }

            if (start > 1) {
                pages.push('...');
            }

            for (let i = start; i <= end; i++) {
                pages.push(i);
            }

            if (end < totalPages - 2) {
                pages.push('...');
            }

            pages.push(totalPages - 1); // 最后一页
        }

        return pages;
    };

    if (totalCount === 0) {
        return (
            <div className="pagination-container">
                <span className="pagination-info">暂无数据</span>
            </div>
        );
    }

    return (
        <div className="pagination-container">
            <div className="pagination-info">
                显示 {startItem}-{endItem} 条，共 {totalCount} 条
            </div>

            <div className="pagination-controls">
                <div className="pagination-size-selector">
                    <span>每页</span>
                    <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
                        <SelectTrigger className="pagination-size-select">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {pageSizeOptions.map((size) => (
                                <SelectItem key={size} value={String(size)}>
                                    {size}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <span>条</span>
                </div>

                <div className="pagination-buttons">
                    <Button
                        variant="outline"
                        size="icon"
                        className="pagination-button"
                        onClick={() => onPageChange(0)}
                        disabled={pageIndex === 0}
                        title="首页"
                    >
                        «
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        className="pagination-button"
                        onClick={() => onPageChange(pageIndex - 1)}
                        disabled={pageIndex === 0}
                        title="上一页"
                    >
                        ‹
                    </Button>

                    {getPageNumbers().map((page, index) => (
                        typeof page === 'number' ? (
                            <Button
                                key={index}
                                variant={page === pageIndex ? "default" : "outline"}
                                size="icon"
                                className={`pagination-button ${page === pageIndex ? 'active' : ''}`}
                                onClick={() => onPageChange(page)}
                            >
                                {page + 1}
                            </Button>
                        ) : (
                            <span key={index} className="pagination-ellipsis">
                {page}
              </span>
                        )
                    ))}

                    <Button
                        variant="outline"
                        size="icon"
                        className="pagination-button"
                        onClick={() => onPageChange(pageIndex + 1)}
                        disabled={pageIndex >= totalPages - 1}
                        title="下一页"
                    >
                        ›
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        className="pagination-button"
                        onClick={() => onPageChange(totalPages - 1)}
                        disabled={pageIndex >= totalPages - 1}
                        title="末页"
                    >
                        »
                    </Button>
                </div>

                <div className="pagination-jumper">
                    <span>跳至</span>
                    <Input
                        type="number"
                        min={1}
                        max={totalPages}
                        className="pagination-jumper-input"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                const value = parseInt((e.target as HTMLInputElement).value, 10);
                                if (value >= 1 && value <= totalPages) {
                                    onPageChange(value - 1);
                                    (e.target as HTMLInputElement).value = '';
                                }
                            }
                        }}
                    />
                    <span>页</span>
                </div>
            </div>
        </div>
    );
};

// 数据变更类型
export type DataChangeType = 'edit' | 'paste';

// 单个变更项
export interface DataChangeItem<T> {
    rowIndex: number;       // 数据行索引
    columnId: string;       // 列ID
    oldValue: any;          // 旧值
    newValue: any;          // 新值
    rowData: T;             // 变更后的整行数据
}

// 数据变更信息
export interface DataChangeInfo<T> {
    type: DataChangeType;           // 变更类型
    changes: DataChangeItem<T>[];   // 变更的单元格列表
    affectedRows: T[];              // 受影响的行数据
    affectedRowIndices: number[];   // 受影响的行索引
}

// 选中单元格信息
export interface SelectedCellInfo {
    rowIndex: number;
    columnIndex: number;
    columnId: string;
}

// 选择范围信息
export interface SelectionRangeInfo {
    start: { rowIndex: number; columnIndex: number };
    end: { rowIndex: number; columnIndex: number };
    cells: SelectedCellInfo[];
}

// 工具栏按钮配置
export interface ToolbarButton {
    key: string;
    label: React.ReactNode;
    onClick: () => void;
    icon?: React.ReactNode;
    disabled?: boolean;
    title?: string;
}

// 编辑触发模式
export type EditTriggerMode = 'click' | 'doubleClick';

// 主表格组件
export interface AdvancedTableProps<T extends Record<string, any>> {
    data: T[];
    columns: ColumnDef<T>[];
    onDataChange?: (data: T[], changeInfo?: DataChangeInfo<T>) => void;
    onFilterChange?: OnFilterChange;
    onSelectionChange?: (selection: SelectionRangeInfo | null) => void;  // 选择变化回调
    enableFiltering?: boolean;
    enableEditing?: boolean;
    editTriggerMode?: EditTriggerMode;  // 编辑触发模式：'click' 单击直接编辑，'doubleClick' 双击编辑（默认）
    autoSave?: boolean;  // 是否自动保存（失焦直接保存，不显示确认按钮），默认 false
    enablePaste?: boolean;  // 是否启用粘贴功能，默认 true
    enableZebraStripes?: boolean;
    enableCrossHighlight?: boolean;
    zebraStripeColor?: string;
    crossHighlightColor?: string;
    selectedBorderColor?: string;  // 选中单元格边框颜色，默认 #1890ff
    enableExport?: boolean;
    exportFilename?: string;
    enableColumnReorder?: boolean; // 是否启用列设置中的排序功能，默认 false
    toolbarButtons?: ToolbarButton[];  // 工具栏扩展按钮
    // 行级别编辑控制
    isRowEditable?: (row: T, rowIndex: number) => boolean;  // 回调函数判断行是否可编辑
    rowEditableKey?: string;  // 数据行中表示是否可编辑的属性名，默认 '_editable'
    // 单元格级别编辑控制（优先级最高）
    isCellEditable?: (row: T, rowIndex: number, columnId: string) => boolean;  // 回调函数判断单元格是否可编辑
    // 分页相关
    enablePagination?: boolean;  // 是否启用分页，默认 false
    pagination?: PaginationConfig;
    onPageChange?: (pageIndex: number) => void;
    onPageSizeChange?: (pageSize: number) => void;
    pageSizeOptions?: number[];  // 每页条数选项
    allData?: T[]; // 用于分页时导出全部数据
    // 配置持久化
    tableId?: string;  // 表格唯一标识符，用于区分不同表格的配置，如果不提供则不启用配置持久化
}

// 表格配置接口
interface TableConfig {
    columnOrder: string[];
    columnVisibility: VisibilityState;
    columnSizing: Record<string, number>;
    columnFixed: Record<string, 'left' | 'right' | null>;
}

// 配置持久化工具函数
export const TableConfigManager = {
    // 保存表格配置到 localStorage
    save(tableId: string, config: TableConfig): void {
        try {
            const key = `advanced-table-config-${tableId}`;
            localStorage.setItem(key, JSON.stringify(config));
            console.log(`[TableConfig] 配置已保存: ${tableId}`, config);
        } catch (error) {
            console.error(`[TableConfig] 保存配置失败: ${tableId}`, error);
        }
    },

    // 从 localStorage 加载表格配置
    load(tableId: string): TableConfig | null {
        try {
            const key = `advanced-table-config-${tableId}`;
            const saved = localStorage.getItem(key);
            if (saved) {
                const config = JSON.parse(saved) as TableConfig;
                console.log(`[TableConfig] 配置已加载: ${tableId}`, config);
                return config;
            }
        } catch (error) {
            console.error(`[TableConfig] 加载配置失败: ${tableId}`, error);
        }
        return null;
    },

    // 清除表格配置
    clear(tableId: string): void {
        try {
            const key = `advanced-table-config-${tableId}`;
            localStorage.removeItem(key);
            console.log(`[TableConfig] 配置已清除: ${tableId}`);
        } catch (error) {
            console.error(`[TableConfig] 清除配置失败: ${tableId}`, error);
        }
    },

    // 清除所有表格配置
    clearAll(): void {
        try {
            const keys = Object.keys(localStorage);
            const tableConfigKeys = keys.filter(key => key.startsWith('advanced-table-config-'));
            tableConfigKeys.forEach(key => localStorage.removeItem(key));
            console.log(`[TableConfig] 已清除所有表格配置，共 ${tableConfigKeys.length} 个`);
        } catch (error) {
            console.error('[TableConfig] 清除所有配置失败', error);
        }
    }
};

export function AdvancedTable<T extends Record<string, any>>({
                                                                 data,
                                                                 columns,
                                                                 onDataChange,
                                                                 onFilterChange,
                                                                 onSelectionChange,
                                                                 enableFiltering = true,
                                                                 enableEditing = true,
                                                                 editTriggerMode = 'doubleClick',
                                                                 autoSave = false,
                                                                 enablePaste = true,
                                                                 enableZebraStripes = true,
                                                                 enableCrossHighlight = true,
                                                                 zebraStripeColor = '#fafafa',
                                                                 crossHighlightColor = '#e6f7ff',
                                                                 selectedBorderColor = '#1890ff',
                                                                 enableExport = true,
                                                                 exportFilename = '表格数据',
                                                                 enableColumnReorder = false,
                                                                 toolbarButtons = [],
                                                                 isRowEditable,
                                                                 rowEditableKey = '_editable',
                                                                 isCellEditable,
                                                                 enablePagination = false,
                                                                 pagination,
                                                                 onPageChange,
                                                                 onPageSizeChange,
                                                                 pageSizeOptions = [10, 20, 50, 100],
                                                                 allData,
                                                                 tableId,
                                                             }: AdvancedTableProps<T>) {
    const [tableData, setTableData] = useState<T[]>(data);

    // 从 localStorage 加载配置（如果提供了 tableId）
    const loadedConfig = useMemo(() => {
        if (tableId) {
            return TableConfigManager.load(tableId);
        }
        return null;
    }, [tableId]);

    const [columnOrder, setColumnOrder] = useState<string[]>(() => {
        // 优先使用加载的配置
        if (loadedConfig?.columnOrder && loadedConfig.columnOrder.length > 0) {
            // 验证配置中的列是否都存在于当前 columns 中
            const currentColumnIds = columns.map((col, index) => col.id || `col-${index}`);
            const validColumns = loadedConfig.columnOrder.filter(id => currentColumnIds.includes(id));

            // 如果有新增的列，添加到末尾
            const newColumns = currentColumnIds.filter(id => !validColumns.includes(id));

            return [...validColumns, ...newColumns];
        }
        return columns.map((col, index) => col.id || `col-${index}`);
    });

    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
        // 优先使用加载的配置
        if (loadedConfig?.columnVisibility) {
            return loadedConfig.columnVisibility;
        }
        return {};
    });

    const [columnSizing, setColumnSizing] = useState<Record<string, number>>(() => {
        // 优先使用加载的配置
        if (loadedConfig?.columnSizing) {
            return loadedConfig.columnSizing;
        }
        return {};
    });

    const [columnFixed, setColumnFixed] = useState<Record<string, 'left' | 'right' | null>>(() => {
        // 优先使用加载的配置
        if (loadedConfig?.columnFixed) {
            return loadedConfig.columnFixed;
        }
        return {};
    });  // 列固定配置
    const [showColumnModal, setShowColumnModal] = useState(false);
    const [selectedCell, setSelectedCell] = useState<{
        rowIndex: number;
        columnId: string;
        columnIndex: number;  // 列的显示索引（从0开始）
    } | null>(null);
    // 多选区域：起始和结束单元格
    const [selectionRange, setSelectionRange] = useState<{
        start: { rowIndex: number; columnIndex: number };
        end: { rowIndex: number; columnIndex: number };
    } | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);  // 是否正在拖拽选择
    const [hoveredCell, setHoveredCell] = useState<{
        rowIndex: number;
        columnId: string;
    } | null>(null);
    const [editingCell, setEditingCell] = useState<{
        rowIndex: number;
        columnId: string;
    } | null>(null);
    const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
    const [columnSorts, setColumnSorts] = useState<ColumnSorts>({});  // 列排序配置
    const [openFilterPanel, setOpenFilterPanel] = useState<{
        columnId: string;
    } | null>(null);
    // 未保存的修改（autoSave=false 时使用）
    const [pendingChanges, setPendingChanges] = useState<Record<number, Record<string, any>>>({});

    const tableRef = useRef<HTMLTableElement>(null);

    // 监听列宽度调整事件
    React.useEffect(() => {
        const handleColumnResizeEvent = (event: Event) => {
            const customEvent = event as CustomEvent;
            const { columnId, size } = customEvent.detail;
            console.log(`[AdvancedTable] 列宽度调整: ${columnId} -> ${size}px`);
            setColumnSizing((prev) => ({
                ...prev,
                [columnId]: size,
            }));
        };

        document.addEventListener('columnResize', handleColumnResizeEvent);
        return () => {
            document.removeEventListener('columnResize', handleColumnResizeEvent);
        };
    }, []);

    // 更新数据
    React.useEffect(() => {
        setTableData(data);
    }, [data]);

    // 当 columns 变化时，更新 columnOrder
    React.useEffect(() => {
        const newColumnIds = columns.map((col, index) => col.id || `col-${index}`);
        setColumnOrder((prevOrder) => {
            // 保留现有的顺序，添加新列到末尾
            const existingIds = new Set(prevOrder);
            const newIds = newColumnIds.filter((id) => !existingIds.has(id));
            return [...prevOrder.filter((id) => newColumnIds.includes(id)), ...newIds];
        });
    }, [columns]);

    // 保存配置到 localStorage（当配置变化时）
    React.useEffect(() => {
        if (tableId) {
            // 使用防抖，避免频繁保存
            const timer = setTimeout(() => {
                const config: TableConfig = {
                    columnOrder,
                    columnVisibility,
                    columnSizing,
                    columnFixed,
                };
                TableConfigManager.save(tableId, config);
            }, 500); // 500ms 防抖

            return () => clearTimeout(timer);
        }
    }, [tableId, columnOrder, columnVisibility, columnSizing, columnFixed]);

    // 判断行是否可编辑（行级别编辑控制）
    // 接受 row 对象和 rowIndex，避免依赖 displayData
    const isRowEditableInternal = useCallback((row: T, rowIndex: number): boolean => {
        if (!row) return false;

        // 1. 检查数据行属性（优先级最高）
        if (rowEditableKey && rowEditableKey in row) {
            const rowEditableValue = (row as any)[rowEditableKey];
            if (typeof rowEditableValue === 'boolean') {
                return rowEditableValue;  // 显式指定，直接返回
            }
        }

        // 2. 检查回调函数
        if (isRowEditable) {
            return isRowEditable(row, rowIndex);
        }

        // 3. 默认可编辑（由列级别和全局开关控制）
        return true;
    }, [rowEditableKey, isRowEditable]);

    // 判断单元格是否可编辑（集成多层编辑控制）
    const isCellEditableInternal = useCallback((
        row: T,
        rowIndex: number,
        columnId: string,
        rowEditable: boolean,
        columnMeta?: any
    ): boolean => {
        // 1. 列级别明确设置了 editable: false - 最高优先级，不可被覆盖
        if (columnMeta?.editable === false) {
            return false; // 列强制不可编辑，任何情况下都不可编辑
        }

        // 2. 单元格级别回调 - 次高优先级（如果提供）
        if (isCellEditable) {
            return isCellEditable(row, rowIndex, columnId);
        }

        // 3. 列级别明确设置了 editable: true - 第三优先级
        if (columnMeta?.editable === true) {
            return true;  // 列强制可编辑，忽略全局和行级别设置
        }

        // 4. 列未设置，遵循全局和行级别设置
        return enableEditing && rowEditable;
    }, [enableEditing, isCellEditable]);

    // 应用过滤条件
    const applyFilter = useCallback((row: T, filters: FilterCondition[], columnId: string): boolean => {
        if (filters.length === 0) return true;

        // 过滤掉无效条件：对于需要值的操作符，值不能为空；对于空/非空操作符，不需要值
        const validFilters = filters.filter((condition) => {
            // 空/非空操作符始终有效
            if (condition.operator === 'isEmpty' || condition.operator === 'isNotEmpty') {
                return true;
            }
            // 其他操作符需要值
            const filterValue = condition.value;
            return filterValue !== null && filterValue !== undefined && String(filterValue).trim() !== '';
        });

        // 如果没有有效条件，不进行过滤
        if (validFilters.length === 0) return true;

        // 所有条件必须满足（AND逻辑）
        return validFilters.every((condition) => {
            const cellValue = (row as any)[columnId];
            const filterValue = condition.value;

            // 处理空/非空操作符
            if (condition.operator === 'isEmpty') {
                return cellValue === null || cellValue === undefined || cellValue === '' || String(cellValue).trim() === '';
            }
            if (condition.operator === 'isNotEmpty') {
                return cellValue !== null && cellValue !== undefined && cellValue !== '' && String(cellValue).trim() !== '';
            }

            // 处理数值类型
            const isNumeric = typeof cellValue === 'number' || !isNaN(Number(cellValue));
            const cellNum = isNumeric ? Number(cellValue) : null;
            const filterNum = isNumeric && filterValue !== '' && filterValue !== undefined ? Number(filterValue) : null;

            const cellStr = String(cellValue || '').toLowerCase();
            const filterStr = String(filterValue || '').toLowerCase();

            switch (condition.operator) {
                case 'equals':
                    if (isNumeric && cellNum !== null && filterNum !== null) {
                        return cellNum === filterNum;
                    }
                    return cellStr === filterStr;
                case 'notEquals':
                    if (isNumeric && cellNum !== null && filterNum !== null) {
                        return cellNum !== filterNum;
                    }
                    return cellStr !== filterStr;
                case 'greaterThan':
                    if (isNumeric && cellNum !== null && filterNum !== null) {
                        return cellNum > filterNum;
                    }
                    return cellStr > filterStr;
                case 'lessThan':
                    if (isNumeric && cellNum !== null && filterNum !== null) {
                        return cellNum < filterNum;
                    }
                    return cellStr < filterStr;
                case 'greaterThanOrEqual':
                    if (isNumeric && cellNum !== null && filterNum !== null) {
                        return cellNum >= filterNum;
                    }
                    return cellStr >= filterStr;
                case 'lessThanOrEqual':
                    if (isNumeric && cellNum !== null && filterNum !== null) {
                        return cellNum <= filterNum;
                    }
                    return cellStr <= filterStr;
                case 'contains':
                    return cellStr.includes(filterStr);
                case 'notContains':
                    return !cellStr.includes(filterStr);
                case 'startsWith':
                    return cellStr.startsWith(filterStr);
                case 'endsWith':
                    return cellStr.endsWith(filterStr);
                default:
                    return true;
            }
        });
    }, []);

    // 过滤后的数据（仅用于显示）- 基于内部状态 tableData
    const filteredData = useMemo(() => {
        let result = [...tableData];

        // 应用每个列的过滤条件
        Object.keys(columnFilters).forEach((columnId) => {
            const filters = columnFilters[columnId];
            if (filters && filters.length > 0) {
                result = result.filter((row) => applyFilter(row, filters, columnId));
            }
        });

        return result;
    }, [tableData, columnFilters, applyFilter]);

    // 使用过滤后的数据进行渲染，但保持原始数据用于编辑
    const displayData = useMemo(() => {
        // 如果有过滤条件，使用过滤后的数据；否则使用内部状态数据
        const hasActiveFilters = Object.keys(columnFilters).some(
            (key) => columnFilters[key] && columnFilters[key].length > 0
        );
        let result = hasActiveFilters ? filteredData : tableData;

        // 应用排序
        Object.keys(columnSorts).forEach((columnId) => {
            const sortConfig = columnSorts[columnId];
            if (sortConfig && sortConfig.direction) {
                result = [...result].sort((a, b) => {
                    const aValue = a[columnId];
                    const bValue = b[columnId];

                    // 处理 null/undefined 值
                    if (aValue == null && bValue == null) return 0;
                    if (aValue == null) return 1;
                    if (bValue == null) return -1;

                    let comparison = 0;

                    if (sortConfig.type === 'numeric') {
                        // 数字排序：强制转换为数字
                        const aNum = Number(aValue);
                        const bNum = Number(bValue);

                        // 处理 NaN
                        if (isNaN(aNum) && isNaN(bNum)) comparison = 0;
                        else if (isNaN(aNum)) comparison = 1;
                        else if (isNaN(bNum)) comparison = -1;
                        else comparison = aNum - bNum;
                    } else {
                        // 字母排序：转换为字符串后比较
                        const aStr = String(aValue).toLowerCase();
                        const bStr = String(bValue).toLowerCase();
                        comparison = aStr.localeCompare(bStr);
                    }

                    // 根据排序方向返回结果
                    return sortConfig.direction === 'asc' ? comparison : -comparison;
                });
            }
        });

        // 应用分页（仅在前端分页模式下）
        if (enablePagination && pagination) {
            if (pagination.mode === 'server') {
                // 后端分页模式：数据已在后端分页，不需要前端再次切片
                console.log('[AdvancedTable] 后端分页模式，数据条数:', result.length);
            } else {
                // 前端分页模式（默认）：在前端对数据进行分页切片
                const { pageIndex, pageSize } = pagination;
                const start = pageIndex * pageSize;
                const end = start + pageSize;
                result = result.slice(start, end);
                console.log('[AdvancedTable] 前端分页模式，切片后数据条数:', result.length);
            }
        }

        return result;
    }, [tableData, filteredData, columnFilters, columnSorts, enablePagination, pagination]);

    // 处理过滤条件变化
    const handleFiltersChange = useCallback(
        async (columnId: string, filters: FilterCondition[]) => {
            const newColumnFilters: ColumnFilters = { ...columnFilters };

            if (filters.length > 0) {
                newColumnFilters[columnId] = filters;
            } else {
                // 移除空数组的列
                delete newColumnFilters[columnId];
            }

            setColumnFilters(newColumnFilters);

            // 调用外部回调（可用于接口调用）
            if (onFilterChange) {
                await onFilterChange(columnId, filters, newColumnFilters);
            }
        },
        [columnFilters, onFilterChange]
    );

    // 处理排序配置变化
    const handleSortChange = useCallback(
        (columnId: string, config: SortConfig) => {
            setColumnSorts((prev) => {
                const newSorts = { ...prev };
                if (config.direction === null) {
                    // 清除排序
                    delete newSorts[columnId];
                } else {
                    newSorts[columnId] = config;
                }
                return newSorts;
            });
        },
        []
    );

    // 处理列固定变更
    const handleFixedChange = useCallback((columnId: string, fixed: 'left' | 'right' | null) => {
        setColumnFixed((prev) => ({
            ...prev,
            [columnId]: fixed,
        }));
    }, []);

    // 根据 columnOrder 重新排列列
    const orderedColumns = useMemo(() => {
        const columnMap = new Map(
            columns.map((col, index) => [col.id || `col-${index}`, col])
        );
        return columnOrder
            .map((id) => {
                const col = columnMap.get(id);
                if (!col) return null;

                // 应用列固定配置到 meta 中
                const fixedValue = columnFixed[id];
                return {
                    ...col,
                    meta: {
                        ...col.meta,
                        fixed: fixedValue || col.meta?.fixed || undefined,
                    },
                };
            })
            .filter(Boolean) as ColumnDef<T>[];
    }, [columns, columnOrder, columnFixed]);

    // 拖拽传感器
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // 处理列拖拽结束
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setColumnOrder((items) => {
                const oldIndex = items.indexOf(active.id as string);
                const newIndex = items.indexOf(over.id as string);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    // 表格实例（使用显示数据）
    const table = useReactTable({
        data: displayData,
        columns: orderedColumns,
        getCoreRowModel: getCoreRowModel(),
        enableColumnResizing: true,  // 启用列宽度调整
        columnResizeMode: 'onChange' as ColumnResizeMode,
        // 使用唯一标识符作为 row ID，避免重复 key 警告
        getRowId: (row, index) => {
            // 优先使用 row.id，如果没有则使用索引 + 随机值确保唯一性
            const rowId = (row as any).id ?? `row-${index}`;
            // 为了确保分页/过滤场景下的唯一性，加上当前数据的内存地址哈希
            return String(rowId);
        },
        state: {
            columnVisibility,
            columnSizing,
        },
        onColumnVisibilityChange: setColumnVisibility,
        onColumnSizingChange: setColumnSizing,
        defaultColumn: {
            size: 150,
            minSize: 50,
            maxSize: 500,
        },
    });

    // 计算固定列的位置（左右累积偏移）
    const fixedColumnsPosition = useMemo(() => {
        const positions: Record<string, number> = {};
        let leftOffset = 0;
        let rightOffset = 0;
        let leftCount = 0;
        let rightCount = 0;

        const headers = table.getHeaderGroups()[0]?.headers || [];
        const visibleHeaders = headers.filter((header) => header.column.getIsVisible());

        // 计算左侧固定列
        for (const header of visibleHeaders) {
            const fixed = header.column.columnDef.meta?.fixed;
            if (fixed === 'left') {
                const columnSize = header.column.getSize();
                positions[header.column.id] = leftOffset;
                // border-collapse 模式下，从第二列开始需要减去 1px 边框重叠
                leftOffset += columnSize - (leftCount > 0 ? 1 : 0);
                leftCount++;
            }
        }

        // 计算右侧固定列（从右往左）
        for (let i = visibleHeaders.length - 1; i >= 0; i--) {
            const header = visibleHeaders[i];
            const fixed = header.column.columnDef.meta?.fixed;
            if (fixed === 'right') {
                const columnSize = header.column.getSize();
                positions[header.column.id] = rightOffset;
                // border-collapse 模式下，从第二列开始需要减去 1px 边框重叠
                rightOffset += columnSize - (rightCount > 0 ? 1 : 0);
                rightCount++;
            }
        }

        return positions;
    }, [table, columnSizing, columnVisibility]);

    // 处理 Excel 粘贴（按照所见即所得的顺序：先横向后纵向填充）
    // startRowIndex: 显示行索引，startColumnIndex: 显示列索引（从0开始）
    const handlePaste = useCallback(
        (e: React.ClipboardEvent, startRowIndex: number, startColumnIndex: number) => {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text');

            if (!pastedData) return;

            // 解析粘贴的数据（支持制表符分隔的多行多列）
            // 处理 Windows (\r\n) 和 Mac (\n) 换行符
            const pastedRows = pastedData
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n')
                .split('\n')
                .map((row) => row.split('\t').map((cell) => cell.trim()))
                .filter((row) => row.some((cell) => cell));

            if (pastedRows.length === 0) return;

            // 获取当前可见列顺序（从第一行的可见单元格获取）
            const rows = table.getRowModel().rows;
            if (rows.length === 0) return;

            const visibleCells = rows[0].getVisibleCells();
            const visibleColumnIds = visibleCells.map((cell) => cell.column.id);

            // 在回调外部预先计算：显示行索引 -> 原始数据行索引的映射
            const displayToDataIndexMap: Map<number, number> = new Map();
            displayData.forEach((displayRow, displayIndex) => {
                const dataIndex = tableData.findIndex((row) => row === displayRow);
                if (dataIndex !== -1) {
                    displayToDataIndexMap.set(displayIndex, dataIndex);
                }
            });

            // 收集变更信息
            const changes: DataChangeItem<T>[] = [];
            const affectedRowIndices: Set<number> = new Set();

            // 复制当前数据进行修改
            const newData = [...tableData];

            // 遍历粘贴的每一行（纵向）
            pastedRows.forEach((pastedRow, rowOffset) => {
                // 计算目标行在 displayData 中的索引
                const targetDisplayRowIndex = startRowIndex + rowOffset;

                // 获取目标行在原始数据中的索引
                const targetDataIndex = displayToDataIndexMap.get(targetDisplayRowIndex);

                if (targetDataIndex !== undefined && targetDataIndex < newData.length) {
                    // 检查行级别编辑权限
                    const targetRow = displayData[targetDisplayRowIndex];
                    if (!targetRow) return;

                    const rowEditable = isRowEditableInternal(targetRow, targetDisplayRowIndex);

                    // 更新现有行：按可见列顺序横向填充
                    const oldRow = newData[targetDataIndex];
                    const updatedRow = { ...oldRow };
                    pastedRow.forEach((cellValue, colOffset) => {
                        // 使用列索引直接定位目标列
                        const targetColumnId = visibleColumnIds[startColumnIndex + colOffset];
                        if (targetColumnId) {
                            // 检查该列是否可编辑
                            const column = table.getColumn(targetColumnId);
                            if (column && isCellEditableInternal(targetRow, targetDisplayRowIndex, targetColumnId, rowEditable, column.columnDef.meta)) {
                                const oldValue = (oldRow as any)[targetColumnId];
                                (updatedRow as any)[targetColumnId] = cellValue;
                                // 记录变更
                                changes.push({
                                    rowIndex: targetDataIndex,
                                    columnId: targetColumnId,
                                    oldValue,
                                    newValue: cellValue,
                                    rowData: updatedRow,
                                });
                            }
                        }
                    });
                    newData[targetDataIndex] = updatedRow;
                    affectedRowIndices.add(targetDataIndex);
                } else if (targetDisplayRowIndex >= displayData.length) {
                    // 如果超出显示范围，在数据末尾创建新行
                    const templateRow = newData[newData.length - 1];
                    const newRow = templateRow ? { ...templateRow } : ({} as T);
                    const newRowIndex = newData.length;
                    // 新行默认可编辑
                    const rowEditable = true;

                    pastedRow.forEach((cellValue, colOffset) => {
                        const targetColumnId = visibleColumnIds[startColumnIndex + colOffset];
                        if (targetColumnId) {
                            // 检查该列是否可编辑
                            const column = table.getColumn(targetColumnId);
                            if (column && isCellEditableInternal(newRow, newRowIndex, targetColumnId, rowEditable, column.columnDef.meta)) {
                                (newRow as any)[targetColumnId] = cellValue;
                                // 记录变更（新行的 oldValue 为 undefined）
                                changes.push({
                                    rowIndex: newRowIndex,
                                    columnId: targetColumnId,
                                    oldValue: undefined,
                                    newValue: cellValue,
                                    rowData: newRow,
                                });
                            }
                        }
                    });
                    newData.push(newRow);
                    affectedRowIndices.add(newRowIndex);
                }
            });

            // 更新状态
            setTableData(newData);

            // 构建变更信息并回调（在状态更新后）
            if (onDataChange && changes.length > 0) {
                const affectedIndices = Array.from(affectedRowIndices).sort((a, b) => a - b);
                const changeInfo: DataChangeInfo<T> = {
                    type: 'paste',
                    changes,
                    affectedRows: affectedIndices.map((idx) => newData[idx]),
                    affectedRowIndices: affectedIndices,
                };
                // 使用 setTimeout 确保状态更新完成后再回调
                setTimeout(() => {
                    onDataChange(newData, changeInfo);
                }, 0);
            }
        },
        [table, displayData, tableData, onDataChange, isRowEditableInternal]
    );

    // 检查单元格是否在选中范围内
    const isCellInSelectionRange = useCallback((rowIndex: number, columnIndex: number): boolean => {
        if (!selectionRange) return false;
        const { start, end } = selectionRange;
        const minRow = Math.min(start.rowIndex, end.rowIndex);
        const maxRow = Math.max(start.rowIndex, end.rowIndex);
        const minCol = Math.min(start.columnIndex, end.columnIndex);
        const maxCol = Math.max(start.columnIndex, end.columnIndex);
        return rowIndex >= minRow && rowIndex <= maxRow && columnIndex >= minCol && columnIndex <= maxCol;
    }, [selectionRange]);

    // 获取选中的单元格范围（包含列 ID）
    const getSelectedCells = useCallback((): SelectedCellInfo[] => {
        if (!selectionRange) return [];
        const { start, end } = selectionRange;
        const minRow = Math.min(start.rowIndex, end.rowIndex);
        const maxRow = Math.max(start.rowIndex, end.rowIndex);
        const minCol = Math.min(start.columnIndex, end.columnIndex);
        const maxCol = Math.max(start.columnIndex, end.columnIndex);

        const visibleCells = table.getRowModel().rows[0]?.getVisibleCells();
        const cells: SelectedCellInfo[] = [];
        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                const columnId = visibleCells?.[c]?.column.id || '';
                cells.push({ rowIndex: r, columnIndex: c, columnId });
            }
        }
        return cells;
    }, [selectionRange, table]);

    // 处理单元格鼠标按下（开始选择）
    const handleCellMouseDown = (rowIndex: number, columnId: string, columnIndex: number, e: React.MouseEvent) => {
        // 忽略右键
        if (e.button !== 0) return;

        // 进入选择模式
        setSelectedCell({ rowIndex, columnId, columnIndex });
        setSelectionRange({
            start: { rowIndex, columnIndex },
            end: { rowIndex, columnIndex },
        });
        setIsSelecting(true);
    };

    // 处理单元格鼠标移动（扩展选择）
    const handleCellMouseEnter = (rowIndex: number, columnIndex: number) => {
        if (isSelecting && selectionRange) {
            setSelectionRange({
                ...selectionRange,
                end: { rowIndex, columnIndex },
            });
        }
        if (enableCrossHighlight) {
            const visibleCells = table.getRowModel().rows[0]?.getVisibleCells();
            const columnId = visibleCells?.[columnIndex]?.column.id || '';
            setHoveredCell({ rowIndex, columnId });
        }
    };

    // 处理鼠标抬起（结束选择）
    const handleMouseUp = useCallback(() => {
        if (isSelecting) {
            setIsSelecting(false);
            // 触发选择变化回调
            if (onSelectionChange && selectionRange) {
                const cells = getSelectedCells();
                onSelectionChange({
                    start: selectionRange.start,
                    end: selectionRange.end,
                    cells,
                });
            }
        }
    }, [isSelecting, onSelectionChange, selectionRange, getSelectedCells]);

    // 全局鼠标抬起监听
    React.useEffect(() => {
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseUp]);


    // 开始编辑单元格
    const handleStartEdit = (rowIndex: number, columnId: string) => {
        if (enableEditing) {
            setEditingCell({ rowIndex, columnId });
        }
    };

    // 保存编辑
    // 处理未保存的修改（autoSave=false 时使用）
    const handlePendingChange = useCallback((rowIndex: number, columnId: string, value: any) => {
        setPendingChanges((prev) => {
            const newPending = { ...prev };
            if (!newPending[rowIndex]) {
                newPending[rowIndex] = {};
            }
            newPending[rowIndex][columnId] = value;
            return newPending;
        });
    }, []);

    const handleSaveEdit = (rowIndex: number, columnId: string, value: any) => {
        // 获取当前显示行对应的原始数据行
        const displayRow = displayData[rowIndex];
        if (!displayRow) return;

        // 在内部状态数据中找到对应的行索引
        const originalRowIndex = tableData.findIndex((row) => row === displayRow);
        if (originalRowIndex === -1) return;

        // 获取旧值
        const oldValue = (displayRow as any)[columnId];

        // 复制并更新数据
        const newData = [...tableData];
        const updatedRow = { ...newData[originalRowIndex] };
        (updatedRow as any)[columnId] = value;
        newData[originalRowIndex] = updatedRow;

        // 更新状态
        setTableData(newData);
        setEditingCell(null);

        // 清除对应的 pendingChange
        setPendingChanges((prev) => {
            const newPending = { ...prev };
            if (newPending[rowIndex] && newPending[rowIndex][columnId] !== undefined) {
                delete newPending[rowIndex][columnId];
                // 如果该行没有其他待保存的修改，删除该行记录
                if (Object.keys(newPending[rowIndex]).length === 0) {
                    delete newPending[rowIndex];
                }
            }
            return newPending;
        });

        // 构建变更信息并回调（在状态更新后）
        if (onDataChange) {
            const changeInfo: DataChangeInfo<T> = {
                type: 'edit',
                changes: [
                    {
                        rowIndex: originalRowIndex,
                        columnId,
                        oldValue,
                        newValue: value,
                        rowData: updatedRow,
                    },
                ],
                affectedRows: [updatedRow],
                affectedRowIndices: [originalRowIndex],
            };
            // 使用 setTimeout 确保状态更新完成后再回调
            setTimeout(() => {
                onDataChange(newData, changeInfo);
            }, 0);
        }
    };

    // 取消编辑
    const handleCancelEdit = () => {
        setEditingCell(null);
    };

    // 处理单元格键盘事件
    const handleCellKeyDown = (e: React.KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
            // 粘贴事件会在 onPaste 中处理
            return;
        }
    };

    // 添加全局粘贴事件监听（按照所见即所得的顺序：先横向后纵向填充）
    React.useEffect(() => {
        const handleGlobalPaste = (e: ClipboardEvent) => {
            if (!enablePaste) return;  // 检查是否启用粘贴
            if (!selectedCell) return;

            const activeElement = document.activeElement;
            if (activeElement && tableRef.current?.contains(activeElement)) {
                const pastedData = e.clipboardData?.getData('text');
                if (!pastedData) return;

                e.preventDefault();

                // 解析粘贴的数据（支持制表符分隔的多行多列）
                // 处理 Windows (\r\n) 和 Mac (\n) 换行符
                const pastedRows = pastedData
                    .replace(/\r\n/g, '\n')
                    .replace(/\r/g, '\n')
                    .split('\n')
                    .map((row) => row.split('\t').map((cell) => cell.trim()))
                    .filter((row) => row.some((cell) => cell));

                if (pastedRows.length === 0) return;

                // 获取当前可见列顺序（从第一行的可见单元格获取）
                const rows = table.getRowModel().rows;
                if (rows.length === 0) return;

                const visibleCells = rows[0].getVisibleCells();
                const visibleColumnIds = visibleCells.map((cell) => cell.column.id);

                // 直接使用存储的列索引
                const startColumnIndex = selectedCell.columnIndex;
                const startRowIndex = selectedCell.rowIndex;

                // 预先计算：显示行索引 -> 原始数据行索引的映射
                const displayToDataIndexMap: Map<number, number> = new Map();
                displayData.forEach((displayRow, displayIndex) => {
                    const dataIndex = tableData.findIndex((row) => row === displayRow);
                    if (dataIndex !== -1) {
                        displayToDataIndexMap.set(displayIndex, dataIndex);
                    }
                });

                // 收集变更信息
                const changes: DataChangeItem<T>[] = [];
                const affectedRowIndices: Set<number> = new Set();

                // 复制当前数据进行修改
                const newData = [...tableData];

                // 遍历粘贴的每一行（纵向）
                pastedRows.forEach((pastedRow, rowOffset) => {
                    // 计算目标行在 displayData 中的索引
                    const targetDisplayRowIndex = startRowIndex + rowOffset;

                    // 获取目标行在原始数据中的索引
                    const targetDataIndex = displayToDataIndexMap.get(targetDisplayRowIndex);

                    if (targetDataIndex !== undefined && targetDataIndex < newData.length) {
                        // 检查行级别编辑权限
                        const targetRow = displayData[targetDisplayRowIndex];
                        if (!targetRow) return;

                        const rowEditable = isRowEditableInternal(targetRow, targetDisplayRowIndex);

                        // 更新现有行：按可见列顺序横向填充
                        const oldRow = newData[targetDataIndex];
                        const updatedRow = { ...oldRow };
                        pastedRow.forEach((cellValue, colOffset) => {
                            // 使用列索引直接定位目标列
                            const targetColumnId = visibleColumnIds[startColumnIndex + colOffset];
                            if (targetColumnId) {
                                // 检查该列是否可编辑
                                const column = table.getColumn(targetColumnId);
                                if (column && isCellEditableInternal(targetRow, targetDisplayRowIndex, targetColumnId, rowEditable, column.columnDef.meta)) {
                                    const oldValue = (oldRow as any)[targetColumnId];
                                    (updatedRow as any)[targetColumnId] = cellValue;
                                    // 记录变更
                                    changes.push({
                                        rowIndex: targetDataIndex,
                                        columnId: targetColumnId,
                                        oldValue,
                                        newValue: cellValue,
                                        rowData: updatedRow,
                                    });
                                }
                            }
                        });
                        newData[targetDataIndex] = updatedRow;
                        affectedRowIndices.add(targetDataIndex);
                    } else if (targetDisplayRowIndex >= displayData.length) {
                        // 如果超出显示范围，在数据末尾创建新行
                        const templateRow = newData[newData.length - 1];
                        const newRow = templateRow ? { ...templateRow } : ({} as T);
                        const newRowIndex = newData.length;
                        // 新行默认可编辑
                        const rowEditable = true;

                        pastedRow.forEach((cellValue, colOffset) => {
                            const targetColumnId = visibleColumnIds[startColumnIndex + colOffset];
                            if (targetColumnId) {
                                // 检查该列是否可编辑
                                const column = table.getColumn(targetColumnId);
                                if (column && isCellEditableInternal(newRow, newRowIndex, targetColumnId, rowEditable, column.columnDef.meta)) {
                                    (newRow as any)[targetColumnId] = cellValue;
                                    // 记录变更（新行的 oldValue 为 undefined）
                                    changes.push({
                                        rowIndex: newRowIndex,
                                        columnId: targetColumnId,
                                        oldValue: undefined,
                                        newValue: cellValue,
                                        rowData: newRow,
                                    });
                                }
                            }
                        });
                        newData.push(newRow);
                        affectedRowIndices.add(newRowIndex);
                    }
                });

                // 更新状态
                setTableData(newData);

                // 构建变更信息并回调（在状态更新后）
                if (onDataChange && changes.length > 0) {
                    const affectedIndices = Array.from(affectedRowIndices).sort((a, b) => a - b);
                    const changeInfo: DataChangeInfo<T> = {
                        type: 'paste',
                        changes,
                        affectedRows: affectedIndices.map((idx) => newData[idx]),
                        affectedRowIndices: affectedIndices,
                    };
                    // 使用 setTimeout 确保状态更新完成后再回调
                    setTimeout(() => {
                        onDataChange(newData, changeInfo);
                    }, 0);
                }
            }
        };

        document.addEventListener('paste', handleGlobalPaste);
        return () => {
            document.removeEventListener('paste', handleGlobalPaste);
        };
    }, [selectedCell, table, displayData, tableData, enablePaste, onDataChange, isRowEditableInternal]);

    // 处理复制选区到剪贴板
    useEffect(() => {
        const handleCopy = async (e: ClipboardEvent) => {
            // 只有当有选区且不是在编辑状态时才处理复制
            if (!selectionRange || editingCell) {
                return;
            }

            // 检查是否是在 input/textarea 中选中文本
            const activeElement = document.activeElement;
            if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
                // 如果在输入框中，不拦截，让默认复制行为生效
                return;
            }

            // 获取选区范围
            const { start, end } = selectionRange;
            const minRow = Math.min(start.rowIndex, end.rowIndex);
            const maxRow = Math.max(start.rowIndex, end.rowIndex);
            const minCol = Math.min(start.columnIndex, end.columnIndex);
            const maxCol = Math.max(start.columnIndex, end.columnIndex);

            // 获取可见列
            const rows = table.getRowModel().rows;
            if (rows.length === 0) return;

            const visibleCells = rows[0]?.getVisibleCells();
            if (!visibleCells) return;

            // 构建复制数据（tab 分隔的格式，兼容 Excel）
            const copyData: string[] = [];
            for (let r = minRow; r <= maxRow && r < rows.length; r++) {
                const rowCells = rows[r].getVisibleCells();
                const rowData: string[] = [];

                for (let c = minCol; c <= maxCol && c < rowCells.length; c++) {
                    const cell = rowCells[c];
                    let cellValue = '';

                    // 获取单元格的值
                    if (cell.column.columnDef.meta?.customCell) {
                        // 对于自定义单元格，尝试从原始数据获取
                        const rowData = cell.row.original;
                        const columnId = cell.column.id;
                        cellValue = String((rowData as any)[columnId] ?? '');
                    } else {
                        // 从 cell.getValue() 获取值
                        const value = cell.getValue();
                        cellValue = String(value ?? '');
                    }

                    rowData.push(cellValue);
                }

                copyData.push(rowData.join('\t'));
            }

            const textToCopy = copyData.join('\n');

            // 写入剪贴板
            try {
                e.preventDefault();
                await navigator.clipboard.writeText(textToCopy);
                console.log(`已复制 ${maxRow - minRow + 1} 行 × ${maxCol - minCol + 1} 列到剪贴板`);
            } catch (err) {
                console.error('复制到剪贴板失败:', err);
                // 降级方案：使用传统方法
                try {
                    const textarea = document.createElement('textarea');
                    textarea.value = textToCopy;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    console.log(`已复制（降级方案）${maxRow - minRow + 1} 行 × ${maxCol - minCol + 1} 列到剪贴板`);
                } catch (fallbackErr) {
                    console.error('降级复制方案也失败:', fallbackErr);
                }
            }
        };

        document.addEventListener('copy', handleCopy);
        return () => {
            document.removeEventListener('copy', handleCopy);
        };
    }, [selectionRange, table, editingCell]);

    // 切换列显示/隐藏
    const toggleColumn = (columnId: string) => {
        setColumnVisibility((prev) => ({
            ...prev,
            [columnId]: prev[columnId] === false,
        }));
    };

    // 处理列大小调整（已废弃 - 现在使用 tanstack table 内置的 resize handler）
    // const handleColumnResize = useCallback((columnId: string, size: number) => {
    //     setColumnSizing((prev) => ({
    //         ...prev,
    //         [columnId]: size,
    //     }));
    // }, []);

    // 获取可见列（按顺序）
    const getVisibleColumns = useCallback(() => {
        return columnOrder
            .filter((id) => columnVisibility[id] !== false)
            .map((id) => {
                const col = columns.find((c) => c.id === id);
                return col ? {
                    id,
                    header: typeof col.header === 'string' ? col.header : id,
                    accessorKey: (col as any).accessorKey || id,
                    exportable: col.meta?.exportable ?? true,  // 默认可导出
                } : null;
            })
            .filter(Boolean) as { id: string; header: string; accessorKey: string; exportable: boolean }[];
    }, [columnOrder, columnVisibility, columns]);

    // 导出 Excel
    const handleExport = useCallback(async (scope: ExportScope = 'filtered') => {
        const visibleColumns = getVisibleColumns();

        // 过滤掉不可导出的列
        const exportableColumns = visibleColumns.filter((col) => col.exportable !== false);

        // 根据导出范围选择数据
        let exportData: T[];
        switch (scope) {
            case 'current':
                // 当前页数据（如果有分页）
                exportData = displayData;
                break;
            case 'all':
                // 全部原始数据（忽略过滤和分页）
                exportData = allData || data;
                break;
            case 'filtered':
            default:
                // 过滤后的数据（所见即所得，但包含所有过滤后的数据）
                exportData = displayData;
                break;
        }

        // 创建工作簿
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'AdvancedTable';
        workbook.created = new Date();

        // 创建工作表
        const worksheet = workbook.addWorksheet('数据', {
            views: [{ state: 'frozen', ySplit: 1 }], // 冻结首行
        });

        // 设置列定义（只包含可导出的列）
        worksheet.columns = exportableColumns.map((col) => {
            // 计算列宽
            const headerLength = col.header.length;
            const maxContentLength = Math.max(
                ...exportData.slice(0, 100).map((row) => {
                    const value = String((row as any)[col.accessorKey] || '');
                    return value.length;
                }),
                headerLength
            );
            const width = Math.min(Math.max(maxContentLength * 1.5 + 4, 12), 50);

            return {
                header: col.header,
                key: col.accessorKey,
                width,
            };
        });

        // 设置表头样式
        const headerRow = worksheet.getRow(1);
        headerRow.height = 28; // 表头行高
        headerRow.eachCell((cell) => {
            // 字体样式
            cell.font = {
                name: '微软雅黑',
                size: 12,
                bold: true,
                color: { argb: 'FFFFFFFF' },
            };
            // 填充背景色
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF1890FF' }, // 蓝色背景
            };
            // 对齐方式
            cell.alignment = {
                vertical: 'middle',
                horizontal: 'center',
                wrapText: true,
            };
            // 边框
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
            };
        });

        // 添加数据行
        exportData.forEach((rowData, rowIndex) => {
            const values = visibleColumns.map((col) => {
                const value = (rowData as any)[col.accessorKey];
                return value !== null && value !== undefined ? value : '';
            });
            const row = worksheet.addRow(values);

            // 设置数据行样式
            row.height = 24; // 数据行高
            row.eachCell((cell) => {
                // 字体样式
                cell.font = {
                    name: '微软雅黑',
                    size: 11,
                    color: { argb: 'FF333333' },
                };
                // 对齐方式
                cell.alignment = {
                    vertical: 'middle',
                    horizontal: 'left',
                    wrapText: false,
                };
                // 边框
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE8E8E8' } },
                    left: { style: 'thin', color: { argb: 'FFE8E8E8' } },
                    bottom: { style: 'thin', color: { argb: 'FFE8E8E8' } },
                    right: { style: 'thin', color: { argb: 'FFE8E8E8' } },
                };
                // 斑马线背景色
                if (rowIndex % 2 === 1) {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF5F5F5' },
                    };
                }
            });
        });

        // 生成文件名
        const timestamp = new Date().toISOString().slice(0, 10);
        const scopeText = scope === 'current' ? '_当前页' : scope === 'all' ? '_全部' : '';
        const filename = `${exportFilename}${scopeText}_${timestamp}.xlsx`;

        // 导出文件
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, filename);
    }, [getVisibleColumns, displayData, data, allData, exportFilename]);

    // 显示导出菜单
    const [showExportMenu, setShowExportMenu] = useState(false);

    return (
        <div className="advanced-table-container">
            <div className="table-toolbar">
                {/* 左侧区域：扩展按钮 */}
                <div className="toolbar-left">
                    {toolbarButtons.map((btn) => (
                        <Button
                            key={btn.key}
                            variant="outline"
                            className="toolbar-button"
                            onClick={btn.onClick}
                            disabled={btn.disabled}
                            title={btn.title}
                        >
                            {btn.icon}
                            {btn.label && <span>{btn.label}</span>}
                        </Button>
                    ))}
                </div>

                {/* 右侧区域：导出和列设置 */}
                <div className="toolbar-right">
                    {enableExport && (
                        <Popover open={showExportMenu} onOpenChange={setShowExportMenu}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="export-button">
                                    <Download size={16} />
                                    <span>导出</span>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="export-popover-content">
                                <div className="export-menu-header">
                                    <span className="export-menu-title">导出数据</span>
                                </div>
                                <div className="export-menu-items">
                                    <button
                                        className="export-menu-item"
                                        onClick={() => {
                                            handleExport('filtered');
                                            setShowExportMenu(false);
                                        }}
                                    >
                                        <div className="export-menu-item-content">
                                            <span className="export-menu-item-label">导出当前数据</span>
                                            <span className="export-menu-item-hint">所见即所得，包含过滤结果</span>
                                        </div>
                                    </button>
                                    {pagination && allData && (
                                        <>
                                            <button
                                                className="export-menu-item"
                                                onClick={() => {
                                                    handleExport('current');
                                                    setShowExportMenu(false);
                                                }}
                                            >
                                                <div className="export-menu-item-content">
                                                    <span className="export-menu-item-label">仅导出当前页</span>
                                                    <span className="export-menu-item-hint">第 {pagination.pageIndex + 1} 页数据</span>
                                                </div>
                                            </button>
                                            <button
                                                className="export-menu-item"
                                                onClick={() => {
                                                    handleExport('all');
                                                    setShowExportMenu(false);
                                                }}
                                            >
                                                <div className="export-menu-item-content">
                                                    <span className="export-menu-item-label">导出全部数据</span>
                                                    <span className="export-menu-item-hint">共 {allData.length} 条记录</span>
                                                </div>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                    )}
                    <Button
                        variant="outline"
                        className="column-settings-button"
                        onClick={() => {
                            console.log('=== 列设置按钮被点击 ===');
                            console.log('当前 showColumnModal:', showColumnModal);
                            setShowColumnModal(true);
                            console.log('设置 showColumnModal 为 true');
                        }}
                        title="列设置"
                    >
                        <Settings size={16} />
                        <span>列设置</span>
                    </Button>
                </div>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <div className="table-wrapper">
                    <table ref={tableRef} className="advanced-table">
                        <thead>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                <SortableContext
                                    items={columnOrder}
                                    strategy={horizontalListSortingStrategy}
                                >
                                    {headerGroup.headers.map((header) => {
                                        const columnId = header.column.id;
                                        const hasFilters = columnFilters[columnId] && columnFilters[columnId].length > 0;
                                        const fixedPosition = fixedColumnsPosition[columnId];
                                        const isFilterOpen = openFilterPanel?.columnId === columnId;

                                        return (
                                            <DraggableColumnHeader
                                                key={header.id}
                                                column={header.column}
                                                hasFilters={hasFilters || false}
                                                showFilter={enableFiltering}
                                                showDragHandle={enableColumnReorder}
                                                fixedPosition={fixedPosition}
                                                isFilterOpen={isFilterOpen}
                                                onFilterOpenChange={(open) => {
                                                    if (enableFiltering) {
                                                        setOpenFilterPanel(open ? { columnId } : null);
                                                    }
                                                }}
                                                filterPanelContent={
                                                    <FilterPanel
                                                        columnId={columnId}
                                                        columnHeader={
                                                            columns.find((col) => col.id === columnId)?.header as string ||
                                                            columnId
                                                        }
                                                        filters={columnFilters[columnId] || []}
                                                        onFiltersChange={(filters) =>
                                                            handleFiltersChange(columnId, filters)
                                                        }
                                                        sortConfig={columnSorts[columnId]}
                                                        onSortChange={(config) => handleSortChange(columnId, config)}
                                                        onClose={() => setOpenFilterPanel(null)}
                                                    />
                                                }
                                            >
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )}
                                            </DraggableColumnHeader>
                                        );
                                    })}
                                </SortableContext>
                            </tr>
                        ))}
                        </thead>
                        <tbody>
                        {table.getRowModel().rows.map((row, rowIndex) => {
                            const isRowHovered = enableCrossHighlight && hoveredCell?.rowIndex === rowIndex;
                            const isZebraRow = enableZebraStripes && rowIndex % 2 === 1;
                            const rowEditable = isRowEditableInternal(row.original, rowIndex);  // 行级别编辑权限

                            return (
                                <tr
                                    key={row.id}
                                    className={`table-row ${isZebraRow ? 'zebra-row' : ''} ${isRowHovered ? 'row-highlighted' : ''} ${!rowEditable ? 'row-readonly' : ''}`}
                                    style={{
                                        ...(isZebraRow && !isRowHovered ? { backgroundColor: zebraStripeColor } : {}),
                                        ...(isRowHovered ? { backgroundColor: crossHighlightColor } : {}),
                                    }}
                                >
                                    {row.getVisibleCells().map((cell, columnIndex) => {
                                        const columnId = cell.column.id;
                                        const isSelected =
                                            selectedCell?.rowIndex === rowIndex &&
                                            selectedCell?.columnId === columnId;
                                        const isInRange = isCellInSelectionRange(rowIndex, columnIndex);
                                        const isEditing =
                                            editingCell?.rowIndex === rowIndex &&
                                            editingCell?.columnId === columnId;
                                        const isColumnHovered = enableCrossHighlight && hoveredCell?.columnId === columnId;
                                        const isCellHovered = isRowHovered && isColumnHovered;

                                        // 获取单元格的原始值（用于编辑）
                                        const cellValue = (row.original as any)[columnId];

                                        // 检查是否有未保存的修改
                                        const hasPendingChange = pendingChanges[rowIndex]?.[columnId] !== undefined;
                                        const displayValue = hasPendingChange ? pendingChanges[rowIndex][columnId] : cellValue;

                                        // 检测列类型（从列定义中获取，或根据值推断）
                                        const columnDef = cell.column.columnDef;
                                        const columnType = (columnDef.meta as any)?.type ||
                                            (typeof cellValue === 'number' ? 'number' : 'text');

                                        // 计算单元格背景色
                                        let cellBgColor = 'white';
                                        if (isZebraRow) cellBgColor = zebraStripeColor;
                                        if (isRowHovered || isColumnHovered) cellBgColor = crossHighlightColor;
                                        if (isCellHovered) cellBgColor = '#bae7ff'; // 交叉点更深的颜色
                                        if (isInRange) cellBgColor = '#e6f7ff'; // 选中范围背景色
                                        if (hasPendingChange) cellBgColor = '#fff7e6'; // 未保存修改的背景色（浅黄色）

                                        // 获取固定列信息
                                        const fixedType = columnDef.meta?.fixed;
                                        const fixedPosition = fixedColumnsPosition[columnId];

                                        return (
                                            <td
                                                key={cell.id}
                                                className={`table-cell ${isSelected ? 'selected' : ''} ${isInRange ? 'in-range' : ''} ${isEditing ? 'editing' : ''} ${isColumnHovered ? 'column-highlighted' : ''} ${isCellHovered ? 'cross-highlighted' : ''} ${fixedType === 'left' ? 'fixed-left' : ''} ${fixedType === 'right' ? 'fixed-right' : ''} ${hasPendingChange ? 'pending-change' : ''}`}
                                                style={{
                                                    width: cell.column.getSize(),
                                                    minWidth: cell.column.columnDef.minSize,
                                                    maxWidth: cell.column.columnDef.maxSize,
                                                    ...(enableCrossHighlight && (isRowHovered || isColumnHovered) ? { backgroundColor: cellBgColor } : {}),
                                                    ...(isInRange ? { backgroundColor: cellBgColor } : {}),
                                                    ...(hasPendingChange ? { backgroundColor: cellBgColor, borderLeft: '2px solid #ffa940' } : {}),
                                                    ...(isSelected ? {
                                                        '--selected-border-color': selectedBorderColor,
                                                        boxShadow: `inset 0 0 0 2px ${selectedBorderColor}`,
                                                    } as React.CSSProperties : {}),
                                                    ...(fixedType === 'left' && fixedPosition !== undefined ? { left: fixedPosition } : {}),
                                                    ...(fixedType === 'right' && fixedPosition !== undefined ? { right: fixedPosition } : {}),
                                                }}
                                                onMouseDown={(e) => {
                                                    if (!isEditing) {
                                                        // 无论什么模式，都启动多选功能
                                                        handleCellMouseDown(rowIndex, columnId, columnIndex, e);
                                                    }
                                                }}
                                                onMouseEnter={() => {
                                                    if (!isEditing) {
                                                        handleCellMouseEnter(rowIndex, columnIndex);
                                                    }
                                                }}
                                                onMouseLeave={() => {
                                                    if (enableCrossHighlight && !isSelecting) {
                                                        setHoveredCell(null);
                                                    }
                                                }}
                                                onPaste={(e) => {
                                                    if (enablePaste && !isEditing) {
                                                        // 传递列索引而不是列ID，确保所见即所得
                                                        handlePaste(e, rowIndex, columnIndex);
                                                    }
                                                }}
                                                onKeyDown={(e) => {
                                                    if (!isEditing) {
                                                        handleCellKeyDown(e);
                                                    }
                                                }}
                                                tabIndex={0}
                                            >
                                                {/* 渲染优先级：1. 可编辑且无自定义cell -> EditableCell  2. 其他 -> flexRender */}
                                                {isCellEditableInternal(row.original, rowIndex, columnId, rowEditable, columnDef.meta) && !columnDef.meta?.customCell ? (
                                                    // 可编辑且无自定义cell：使用 EditableCell
                                                    <EditableCell
                                                        value={displayValue}
                                                        rowIndex={rowIndex}
                                                        columnId={columnId}
                                                        isEditing={isEditing}
                                                        onStartEdit={() => handleStartEdit(rowIndex, columnId)}
                                                        onSave={(value) => handleSaveEdit(rowIndex, columnId, value)}
                                                        onCancel={handleCancelEdit}
                                                        onPendingChange={handlePendingChange}
                                                        columnType={columnType}
                                                        autoSave={autoSave}
                                                        editTriggerMode={editTriggerMode}
                                                    />
                                                ) : columnDef.cell ? (
                                                    // 有自定义 cell 或不可编辑：使用 flexRender
                                                    flexRender(
                                                        cell.column.columnDef.cell,
                                                        cell.getContext()
                                                    )
                                                ) : (
                                                    // 无 cell 定义且不可编辑：显示纯文本
                                                    displayValue
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>
            </DndContext>

            {/* 分页组件 */}
            {enablePagination && pagination && onPageChange && onPageSizeChange && (
                <Pagination
                    pageIndex={pagination.pageIndex}
                    pageSize={pagination.pageSize}
                    totalCount={pagination.totalCount}
                    onPageChange={onPageChange}
                    onPageSizeChange={onPageSizeChange}
                    pageSizeOptions={pageSizeOptions}
                />
            )}

            {showColumnModal && (
                <ColumnVisibilityModal
                    columns={table.getAllLeafColumns()}
                    columnVisibility={columnVisibility}
                    columnOrder={columnOrder}
                    onToggleColumn={toggleColumn}
                    onColumnOrderChange={setColumnOrder}
                    onClose={() => setShowColumnModal(false)}
                    enableReorder={enableColumnReorder}
                    columnFixed={columnFixed}
                    onFixedChange={handleFixedChange}
                />
            )}
        </div>
    );
}

