import * as React from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  CalendarPlusIcon,
  ClockIcon,
  ListFilterIcon,
  MailCheckIcon,
  MoreHorizontalIcon,
  TagIcon,
  Trash2Icon,
  Play,
  Check,
  Share2,
  Undo,
  Redo,
  Form,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
} from "@/components/ui/select";

export default function HeaderActions() {
  const [cppVersion, setCppVersion] = React.useState("c++17");

  return (
    <div className="flex items-center space-x-2">
      <ButtonGroup className="hidden sm:flex">
        <Button variant="outline" size="icon" aria-label="Go Back">
          <Undo />
        </Button>
        <Button variant="outline" size="icon" aria-label="Go Back">
          <Redo />
        </Button>
      </ButtonGroup>
      <Select value={cppVersion} onValueChange={setCppVersion}>
        <SelectTrigger className="w-full max-w-48">
          <SelectValue placeholder="C++ Version" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectGroup>
            <SelectLabel>C++ Version</SelectLabel>
            <SelectItem value="c++98">C++ 98</SelectItem>
            <SelectItem value="c++14">C++ 14</SelectItem>
            <SelectItem value="c++17">C++ 17</SelectItem>
            <SelectItem value="c++20">C++ 20</SelectItem>
            <SelectItem value="c++23">C++ 23</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <ButtonGroup>
        <Button variant="outline">
          <Play />
          Run
        </Button>
        {/* <Button variant="outline">Run in interactive</Button> */}
      </ButtonGroup>
      <ButtonGroup>
        <Button variant="outline">
          <Form />
          Format
        </Button>
        {/* <Button variant="outline">Run in interactive</Button> */}
      </ButtonGroup>
      <ButtonGroup>
        <Button variant="outline">
          <Share2 />
          Share
        </Button>
      </ButtonGroup>
    </div>
  );
}
