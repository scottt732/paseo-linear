import { defineAttachmentSource } from "@getpaseo/plugin";
import { searchIssuesRpc } from "./rpc";

export const issueAttachments = defineAttachmentSource({
  id: "issues",
  title: "Linear issue",
  icon: "CircleDot",
  pickerTitle: "Attach Linear issue",
  searchPlaceholder: "Search by identifier or title",
  search: searchIssuesRpc,
});
