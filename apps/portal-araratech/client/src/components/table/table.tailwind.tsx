const Style = {
  table: "w-full border-separate -mb-6",
  search: "mb-4",
  loading: "relative py-8",
  badge: "ml-0",
  empty: "py-3",
  thead: "hidden font-semibold md:table-header-group",
  th_actions: "text-right",

  th: "text-left outline-0 capitalize p-5 pt-0 border-b border-dotted border-slate-100 first:pl-0 last:pr-0",
  sort: `relative cursor-pointer after:absolute after:right-0 after:top-1/2 after:mt-1
    after:w-3 after:h-3 after:opacity-50 after:-translate-y-1/2 after:bg-contain`,

  asc: `after:bg-[url('components/table/icons/ico-sort-asc.svg')]`,
  desc: `after:bg-[url('components/table/icons/ico-sort-dsc.svg')]`,

  cell: `float-left w-full p-0 mb-2 first:pl-0 last:pr-0 last:pb-5 last:border-b last:border-solid 
    last:border-slate-100 md:float-none md:w-auto md:mb-0 md:p-5 md:border-b md:border-solid md:border-slate-100`,

  actions: `text-left float-left clear-left mb-4 whitespace-nowrap
  md:float-none md:clear-none md:text-right md:mb-0 border-b border-slate-100 border-solid`,

  actionButton:
    "inline-block whitespace-nowrap -top-1 mr-3 bg-transparent last:mr-0",
  body: "",
};

export default Style;
