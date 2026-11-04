// Translated shape factory from lib/shape/shape.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Box } from '../geo/box.js';
import type { BaseShape } from './base.js';
import { ShapeC4Person } from './shape_c4_person.js';
import { ShapeCallout } from './shape_callout.js';
import { ShapeCircle } from './shape_circle.js';
import { ShapeClass } from './shape_class.js';
import { ShapeCloud } from './shape_cloud.js';
import { ShapeCode } from './shape_code.js';
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
import { ShapeRealSquare } from './shape_real_square.js';
import { ShapeSquare } from './shape_square.js';
import { ShapeStep } from './shape_step.js';
import { ShapeStoredData } from './shape_stored_data.js';
import { ShapeTable } from './shape_table.js';
import { ShapeText } from './shape_text.js';
export function NewShape(type: string, box: Box): BaseShape {
  switch (type) {
    case 'C4Person':
      return new ShapeC4Person(box);
    case 'Callout':
      return new ShapeCallout(box);
    case 'Circle':
      return new ShapeCircle(box);
    case 'Class':
      return new ShapeClass(box);
    case 'Cloud':
      return new ShapeCloud(box);
    case 'Code':
      return new ShapeCode(box);
    case 'Cylinder':
      return new ShapeCylinder(box);
    case 'Diamond':
      return new ShapeDiamond(box);
    case 'Document':
      return new ShapeDocument(box);
    case 'Hexagon':
      return new ShapeHexagon(box);
    case 'Image':
      return new ShapeImage(box);
    case 'Oval':
      return new ShapeOval(box);
    case 'Package':
      return new ShapePackage(box);
    case 'Page':
      return new ShapePage(box);
    case 'Parallelogram':
      return new ShapeParallelogram(box);
    case 'Person':
      return new ShapePerson(box);
    case 'Queue':
      return new ShapeQueue(box);
    case 'RealSquare':
      return new ShapeRealSquare(box);
    case 'Square':
      return new ShapeSquare(box);
    case 'Step':
      return new ShapeStep(box);
    case 'StoredData':
      return new ShapeStoredData(box);
    case 'Table':
      return new ShapeTable(box);
    case 'Text':
      return new ShapeText(box);
    default: {
      const shape = new ShapeSquare(box);
      shape.Type = type;
      return shape;
    }
  }
}
