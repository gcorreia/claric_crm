import type { RouteObject } from "react-router-dom";
import { OverviewPage } from "./pages/OverviewPage";
import { ListPage } from "./pages/ListPage";
import { CreatePage } from "./pages/CreatePage";

export const routes: RouteObject[] = [
  { index: true, element: <OverviewPage /> },
  { path: "lista", element: <ListPage /> },
  { path: "novo", element: <CreatePage /> },
];