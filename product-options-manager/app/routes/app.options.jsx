export default function ProductOptionsPage() {
  const groups = [
    {
      id: "1",
      name: "Black Cotton canvas Zipper Box Kit",
      status: "Active",
      options: 6,
    },
    {
      id: "2",
      name: "Green Canvas Zipper Box Kit",
      status: "Active",
      options: 6,
    },
  ];

  return (
    <s-page heading="Product Options">
      <s-button slot="primary-action" href="/app/options/new" variant="primary">
        Add group
      </s-button>

      <s-section>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={headerCellStyle}>Group name</th>
              <th style={headerCellStyle}>Options</th>
              <th style={headerCellStyle}>Status</th>
              <th style={headerCellStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.id}>
                <td style={bodyCellStyle}>
                  <strong>{group.name}</strong>
                </td>
                <td style={bodyCellStyle}>{group.options}</td>
                <td style={bodyCellStyle}>
                  <span style={badgeStyle}>{group.status}</span>
                </td>
                <td style={bodyCellStyle}>
                  <s-stack direction="inline" gap="small">
                    <s-button href={`/app/options/${group.id}`}>Edit</s-button>
                    <s-button>Duplicate</s-button>
                    <s-button tone="critical">Delete</s-button>
                  </s-stack>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </s-section>
    </s-page>
  );
}

const headerCellStyle = {
  padding: "12px",
  borderBottom: "1px solid #dfe3e8",
  textAlign: "left",
};

const bodyCellStyle = {
  padding: "12px",
  borderBottom: "1px solid #eef0f2",
  verticalAlign: "middle",
};

const badgeStyle = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: "999px",
  background: "#aee9d1",
  color: "#202223",
  fontSize: "12px",
  fontWeight: 600,
};
