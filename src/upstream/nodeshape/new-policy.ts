import { NewShape } from '../shape/new-shape.js';
// Translated policy construction from internal/nodeshape/shape.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Box } from '../geo/box.js';
import type { ShapePolicy } from './policy.js';
import { Kind } from './kind.js';
import { ShapeC4Person } from './shape_c4person.js';
import { ShapeCallout } from './shape_callout.js';
import { ShapeCircle } from './shape_circle.js';
import { ShapeCloud } from './shape_cloud.js';
import { ShapeCylinder } from './shape_cylinder.js';
import { ShapeDiamond } from './shape_diamond.js';
import { ShapeDocument } from './shape_document.js';
import { ShapeHexagon } from './shape_hexagon.js';
import { ShapeImage } from './shape_image.js';
import { ShapeOval } from './shape_oval.js';
import { ShapePackage } from './shape_package.js';
import { ShapePage } from './shape_page.js';
import { ShapeParallelogram } from './shape_parallelogram.js';
import { ShapePerson } from './shape_person.js';
import { ShapeQueue } from './shape_queue.js';
import { ShapeSquare } from './shape_square.js';
import { ShapeStep } from './shape_step.js';
import { ShapeStoredData } from './shape_stored_data.js';
import { ShapeTable } from './shape_table.js';
export function NewPolicy(
  typeName: string,
  box: Box,
): [ShapePolicy | null, Kind, boolean] {
  switch (typeName) {
    case 'C4Person':
      return [
        new ShapeC4Person(box, NewShape(typeName, box)),
        Kind.C4Person,
        true,
      ];
    case 'Callout':
      return [
        new ShapeCallout(box, NewShape(typeName, box)),
        Kind.Callout,
        true,
      ];
    case 'Circle':
      return [new ShapeCircle(box, NewShape(typeName, box)), Kind.Circle, true];
    case 'Cloud':
      return [new ShapeCloud(box, NewShape(typeName, box)), Kind.Cloud, true];
    case 'Cylinder':
      return [
        new ShapeCylinder(box, NewShape(typeName, box)),
        Kind.Cylinder,
        true,
      ];
    case 'Diamond':
      return [
        new ShapeDiamond(box, NewShape(typeName, box)),
        Kind.Diamond,
        true,
      ];
    case 'Document':
      return [
        new ShapeDocument(box, NewShape(typeName, box)),
        Kind.Document,
        true,
      ];
    case 'Hexagon':
      return [
        new ShapeHexagon(box, NewShape(typeName, box)),
        Kind.Hexagon,
        true,
      ];
    case 'Image':
      return [new ShapeImage(box, NewShape(typeName, box)), Kind.Image, true];
    case 'Oval':
      return [new ShapeOval(box, NewShape(typeName, box)), Kind.Oval, true];
    case 'Package':
      return [
        new ShapePackage(box, NewShape(typeName, box)),
        Kind.Package,
        true,
      ];
    case 'Page':
      return [new ShapePage(box, NewShape(typeName, box)), Kind.Page, true];
    case 'Parallelogram':
      return [
        new ShapeParallelogram(box, NewShape(typeName, box)),
        Kind.Parallelogram,
        true,
      ];
    case 'Person':
      return [new ShapePerson(box, NewShape(typeName, box)), Kind.Person, true];
    case 'Queue':
      return [new ShapeQueue(box, NewShape(typeName, box)), Kind.Queue, true];
    case 'Square':
      return [new ShapeSquare(box, NewShape(typeName, box)), Kind.Square, true];
    case 'Step':
      return [new ShapeStep(box, NewShape(typeName, box)), Kind.Step, true];
    case 'StoredData':
      return [
        new ShapeStoredData(box, NewShape(typeName, box)),
        Kind.StoredData,
        true,
      ];
    case 'Table':
      return [new ShapeTable(box, NewShape(typeName, box)), Kind.Table, true];
    case 'RealSquare':
      return [
        new ShapeSquare(box, NewShape(typeName, box)),
        Kind.RealSquare,
        true,
      ];
    case 'Class':
      return [new ShapeSquare(box, NewShape(typeName, box)), Kind.Class, true];
    case 'Text':
      return [new ShapeSquare(box, NewShape(typeName, box)), Kind.Text, true];
    case 'Code':
      return [new ShapeSquare(box, NewShape(typeName, box)), Kind.Code, true];
    case '':
      return [new ShapeSquare(box, NewShape(typeName, box)), Kind.Square, true];
    default:
      return [null, Kind.Square, false];
  }
}
