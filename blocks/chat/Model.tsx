import { Key, ListBox, Select } from "@heroui/react";
import { useState } from "react";

export interface Model {
  id: string;
  name: string;
  provider: string;
}

export function ModelSelector({
  models,
  defaultID,
  onChange,
}: {
  models: Model[];
  defaultID?: string;
  onChange: (id: string) => void;
}) {
  const [selected, setSelected] = useState<Key | null>(defaultID || null);

  const handleChange = (v: Key | null) => {
    setSelected(v);
    onChange(v?.toString() || "");
  };

  return (
    <Select
      placeholder="选择模型"
      variant="secondary"
      aria-label="model selector"
      value={selected}
      onChange={handleChange}
      className={"min-w-32"}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover className={"rounded-2xl"}>
        <ListBox>
          {models.map((model) => (
            <ListBox.Item
              key={model.id}
              id={model.id}
              textValue={model.name}
              aria-label={model.name}
            >
              {model.name}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
